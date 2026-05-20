import { type AlertIncident, AlertIncidentRepository } from "@domain/alerts"
import { EvaluationRepository } from "@domain/evaluations"
import { DEFAULT_ESCALATION_SENSITIVITY_K } from "@domain/issues"
import type { MembershipRepository } from "@domain/organizations"
import { ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import {
  AlertIncidentId,
  type ChSqlClient,
  generateId,
  IssueId,
  isIncidentNotificationEnabled,
  type NotFoundError,
  NotificationId,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  SettingsReader,
  type SqlClient,
  UserId,
} from "@domain/shared"
import { UserRepository } from "@domain/users"
import { Effect } from "effect"
import type {
  IncidentBreach,
  IncidentClosedPayload,
  IncidentEventPayload,
  IncidentOpenedPayload,
  IncidentRecovery,
  IncidentSampleAuthor,
  IncidentSampleExcerpt,
  IncidentTrend,
} from "../entities/notification.ts"
import { buildIdempotencyKey } from "../helpers/idempotency-key.ts"
import { resolveRecipients } from "../helpers/resolve-recipients.ts"

/**
 * Hint from the originating outbox event. The producer derives the
 * concrete notification kind from the incident's lifecycle state (the
 * `endedAt` discriminator), but the transition is what scopes the
 * "created" branch — a replay of `IncidentCreated` after the same
 * incident has since closed must still emit the original
 * `incident.opened`/`incident.event`, not a phantom `incident.closed`.
 */
export type IncidentTransition = "created" | "closed"

export interface RequestIncidentNotificationsInput {
  readonly alertIncidentId: string
  readonly transition: IncidentTransition
}

export type IncidentNotificationKind = "incident.event" | "incident.opened" | "incident.closed"

export interface IncidentNotificationRequest {
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly kind: IncidentNotificationKind
  readonly idempotencyKey: string
  readonly payload: IncidentEventPayload | IncidentOpenedPayload | IncidentClosedPayload
  /** Pre-generated row id so producer + consumer can share it for retries. */
  readonly notificationId: NotificationId
  /** Project anchor for cascade-delete on `ProjectDeleted`. */
  readonly projectId: ProjectId
}

export type RequestIncidentNotificationsResult =
  | { readonly status: "skipped"; readonly reason: "kind-disabled" | "no-recipients" }
  | { readonly status: "ok"; readonly requests: readonly IncidentNotificationRequest[] }

export type RequestIncidentNotificationsError = RepositoryError | NotFoundError

/**
 * Window/bucket size used for the trend snapshot on sustained kinds.
 * 18 buckets × 10 min = 3h, sized to fit comfortably in an email-width
 * chart and a bell sparkline while keeping enough resolution to read
 * the climb (opened) or descent (closed). Hourly seasonal-grid projection
 * still works at 10-min buckets — each bucket's threshold is roughly the
 * 1h figure pro-rated, computed inside the analytics repo.
 */
const TREND_BUCKET_SECONDS = 600
const TREND_WINDOW_MS = 3 * 60 * 60 * 1000

/** Cap on sample-excerpt text length; truncated longer feedback gets `truncated: true`. */
const SAMPLE_EXCERPT_MAX_CHARS = 200
/** Top-N tags surfaced in the email body. Sorted alphabetically (matches `IssueTagsAggregate` UI rendering). */
const TAGS_TOP_N = 5
/** History window for tag aggregation. Matches the issue-list/drawer convention. */
const TAGS_LOOKBACK_DAYS = 30

const resolveKind = (incident: AlertIncident, transition: IncidentTransition): IncidentNotificationKind => {
  if (transition === "closed") return "incident.closed"
  // "created" — the incident is freshly inserted. `endedAt = startedAt`
  // means an eventful kind (issue.new / issue.regressed) that collapsed
  // to a point in time; otherwise it's the open side of a sustained
  // incident.
  return incident.endedAt !== null && incident.endedAt.getTime() === incident.startedAt.getTime()
    ? "incident.event"
    : "incident.opened"
}

/**
 * Snapshot a 3h trend window ending at the relevant transition timestamp.
 * Returns `null` for `incident.event` (one-shot kinds have nothing to
 * trend at notification time) and for missing analytics data.
 */
const snapshotTrend = (input: {
  readonly incident: AlertIncident
  readonly kind: IncidentNotificationKind
  readonly kShort: number
}) =>
  Effect.gen(function* () {
    const { incident, kind, kShort } = input
    if (kind === "incident.event") return null

    const anchorMs =
      kind === "incident.closed" && incident.endedAt !== null
        ? incident.endedAt.getTime()
        : incident.startedAt.getTime()
    const to = new Date(anchorMs)
    const from = new Date(anchorMs - TREND_WINDOW_MS)

    const analytics = yield* ScoreAnalyticsRepository
    const [counts, thresholds] = yield* Effect.all([
      analytics.histogramByIssues({
        organizationId: incident.organizationId,
        projectId: incident.projectId,
        issueIds: [IssueId(incident.sourceId)],
        timeRange: { from, to },
        bucketSeconds: TREND_BUCKET_SECONDS,
      }),
      analytics.escalationThresholdHistogramByIssues({
        organizationId: incident.organizationId,
        projectId: incident.projectId,
        issueIds: [IssueId(incident.sourceId)],
        timeRange: { from, to },
        bucketSeconds: TREND_BUCKET_SECONDS,
        kShort,
      }),
    ])

    // Zip counts + thresholds by bucket key. The threshold repo can emit
    // `NaN` for buckets with no historical data; normalise to `null` so
    // it round-trips through the JSON payload cleanly (NaN serialises to
    // `null` anyway, but we'd lose the type-level guarantee). The bell
    // sparkline + email chart break the dashed curve across `null`s the
    // same way `IssueTrendBar` does today.
    const thresholdByBucket = new Map<string, number | null>()
    for (const entry of thresholds[0]?.buckets ?? []) {
      thresholdByBucket.set(entry.bucket, Number.isFinite(entry.thresholdCount) ? entry.thresholdCount : null)
    }

    const points: IncidentTrend["points"] = counts.map((bucket) => ({
      t: bucket.bucket,
      count: bucket.count,
      threshold: thresholdByBucket.get(bucket.bucket) ?? null,
    }))

    return { bucketDurationMs: TREND_BUCKET_SECONDS * 1000, points } as const
  })

/**
 * Snapshot the top-N tags from the issue's recent traces. Sorted
 * alphabetically (matches the `IssueTagsAggregate` UI rendering) and
 * sliced so the email body stays compact. Returns `undefined` when
 * there are no tags so the template can skip the chips block.
 */
const snapshotTags = (incident: AlertIncident) =>
  Effect.gen(function* () {
    const analytics = yield* ScoreAnalyticsRepository
    const from = new Date(Date.now() - TAGS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    const aggregates = yield* analytics.aggregateTagsByIssues({
      organizationId: incident.organizationId,
      projectId: incident.projectId,
      issueIds: [IssueId(incident.sourceId)],
      timeRange: { from },
    })
    const all = aggregates[0]?.tags ?? []
    if (all.length === 0) return undefined
    return [...all].sort((a, b) => a.localeCompare(b)).slice(0, TAGS_TOP_N)
  })

/**
 * Resolve the attribution for an annotation score. Falls back to a
 * `system` author when the score is a Latitude-authored draft
 * (`annotatorId IS NULL`); otherwise looks up the user once via
 * `UserRepository` and snapshots `{ name, imageUrl }`.
 *
 * Missing user (rare — would mean the row was hard-deleted between
 * the score landing and the alert firing) degrades to `system` so the
 * template still has something sensible to render.
 */
const resolveAnnotationAuthor = (annotatorId: string | null) =>
  Effect.gen(function* () {
    if (annotatorId === null) return { kind: "system" } as const
    const users = yield* UserRepository
    const user = yield* users
      .findById(UserId(annotatorId))
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    if (user === null) return { kind: "system" } as const
    return {
      kind: "user" as const,
      name: user.name?.trim().length ? user.name : user.email,
      imageUrl: user.image ?? null,
    }
  })

/**
 * Resolve the evaluation name for an evaluation score's attribution.
 * Falls back to `null` when the evaluation row can't be fetched —
 * caller skips the excerpt entirely in that case (the alternative,
 * an "Unknown evaluation" label, would be more confusing than
 * showing nothing).
 */
const resolveEvaluationAuthor = (input: { readonly projectId: ProjectId; readonly evaluationId: string }) =>
  Effect.gen(function* () {
    const evaluations = yield* EvaluationRepository
    const evaluation = yield* evaluations
      .findById(input.evaluationId)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    if (evaluation === null) return null
    return { kind: "evaluation" as const, name: evaluation.name }
  })

/**
 * Snapshot a short excerpt the recipient can triage from inbox.
 * Picks the latest annotation's `rawFeedback` when present; otherwise
 * falls back to the latest evaluation score's `feedback` text.
 * Returns `undefined` when neither exists.
 */
const snapshotSampleExcerpt = (incident: AlertIncident) =>
  Effect.gen(function* () {
    const scores = yield* ScoreRepository
    const truncate = (text: string): IncidentSampleExcerpt["text"] => text.slice(0, SAMPLE_EXCERPT_MAX_CHARS)

    const annotations = yield* scores.listByIssueId({
      projectId: incident.projectId,
      issueId: IssueId(incident.sourceId),
      source: "annotation",
      options: { limit: 1 },
    })
    const latestAnnotation = annotations.items[0]
    if (latestAnnotation && latestAnnotation.source === "annotation") {
      const raw = latestAnnotation.metadata.rawFeedback
      if (raw.trim().length > 0) {
        const author: IncidentSampleAuthor = yield* resolveAnnotationAuthor(latestAnnotation.annotatorId)
        return {
          text: truncate(raw),
          truncated: raw.length > SAMPLE_EXCERPT_MAX_CHARS,
          author,
        } satisfies IncidentSampleExcerpt
      }
    }

    const evaluations = yield* scores.listByIssueId({
      projectId: incident.projectId,
      issueId: IssueId(incident.sourceId),
      source: "evaluation",
      options: { limit: 1 },
    })
    const latestEvaluation = evaluations.items[0]
    if (latestEvaluation && latestEvaluation.source === "evaluation" && latestEvaluation.feedback.trim().length > 0) {
      const raw = latestEvaluation.feedback
      const author = yield* resolveEvaluationAuthor({
        projectId: incident.projectId,
        evaluationId: latestEvaluation.sourceId,
      })
      // No eval name resolvable → skip the excerpt entirely rather
      // than show an unattributed evaluation reading.
      if (author === null) return undefined
      return {
        text: truncate(raw),
        truncated: raw.length > SAMPLE_EXCERPT_MAX_CHARS,
        author,
      } satisfies IncidentSampleExcerpt
    }

    return undefined
  })

/**
 * Snapshot breach scalars for the opened-side email copy. Returns
 * `undefined` for legacy escalating incidents that don't have
 * `entrySignals` — those predate the seasonal detector's snapshot.
 *
 * `triggerRate` is derived from the snapshotted trend: the peak
 * per-bucket count converted to per-hour. The exact instantaneous rate
 * that tripped entry isn't preserved on the incident row, but the trend
 * peak is the rate the user would see in the chart and matches the
 * "climbed to" copy.
 */
const buildBreach = (incident: AlertIncident, trend: IncidentTrend | null): IncidentBreach | undefined => {
  if (incident.entrySignals === null || trend === null) return undefined
  const peakCount = trend.points.reduce((m, p) => (p.count > m ? p.count : m), 0)
  const bucketHours = trend.bucketDurationMs / (60 * 60 * 1000)
  const triggerRate = bucketHours > 0 ? peakCount / bucketHours : 0
  return {
    triggerRate,
    baselineRate: incident.entrySignals.expected1h,
    threshold: incident.entrySignals.entryThreshold1h,
  }
}

/**
 * Snapshot recovery scalars for the closed-side email copy. Duration
 * is `endedAt - startedAt` in ms; the template humanizes ("elevated
 * for 32m").
 */
const buildRecovery = (incident: AlertIncident): IncidentRecovery => ({
  durationMs: incident.endedAt !== null ? Math.max(0, incident.endedAt.getTime() - incident.startedAt.getTime()) : 0,
})

const buildPayload = (input: {
  readonly incident: AlertIncident
  readonly kind: IncidentNotificationKind
  readonly trend: IncidentTrend | null
  readonly tags: readonly string[] | undefined
  readonly sampleExcerpt: IncidentSampleExcerpt | undefined
}): IncidentEventPayload | IncidentOpenedPayload | IncidentClosedPayload => {
  const { incident, kind, trend, tags, sampleExcerpt } = input
  const base = {
    alertIncidentId: incident.id,
    sourceType: incident.sourceType,
    sourceId: incident.sourceId,
    incidentKind: incident.kind,
    severity: incident.severity,
  } as const

  const mutableTags = tags ? [...tags] : undefined
  if (kind === "incident.event") {
    return {
      alertIncidentId: base.alertIncidentId,
      sourceType: base.sourceType,
      sourceId: base.sourceId,
      incidentKind: base.incidentKind,
      severity: base.severity,
      ...(mutableTags ? { tags: mutableTags } : {}),
      ...(sampleExcerpt ? { sampleExcerpt } : {}),
    }
  }
  // Sustained kinds must carry the trend snapshot (caller guarantees it).
  if (trend === null) throw new Error(`Missing trend snapshot for ${kind}`)
  if (kind === "incident.opened") {
    const breach = buildBreach(incident, trend)
    return {
      alertIncidentId: base.alertIncidentId,
      sourceType: base.sourceType,
      sourceId: base.sourceId,
      incidentKind: base.incidentKind,
      severity: base.severity,
      trend,
      ...(mutableTags ? { tags: mutableTags } : {}),
      ...(breach ? { breach } : {}),
      ...(sampleExcerpt ? { sampleExcerpt } : {}),
    }
  }
  return {
    alertIncidentId: base.alertIncidentId,
    sourceType: base.sourceType,
    sourceId: base.sourceId,
    incidentKind: base.incidentKind,
    severity: base.severity,
    trend,
    recovery: buildRecovery(incident),
  }
}

/**
 * Producer step for incident notifications. Loads the alert incident,
 * derives the notification kind from the lifecycle (`endedAt` vs
 * `startedAt`), applies the project-level alert-kind gate, snapshots the
 * trend window for sustained kinds, resolves recipients, and returns one
 * request per recipient.
 *
 * No DB writes happen here — this is pure orchestration. Idempotency is
 * delegated to the consumer via the unique `idempotency_key`.
 */
export const requestIncidentNotificationsUseCase = (input: RequestIncidentNotificationsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("alertIncidentId", input.alertIncidentId)
    yield* Effect.annotateCurrentSpan("transition", input.transition)

    const incidentRepo = yield* AlertIncidentRepository
    const incident = yield* incidentRepo.findById(AlertIncidentId(input.alertIncidentId))

    const notificationKind = resolveKind(incident, input.transition)
    yield* Effect.annotateCurrentSpan("kind", notificationKind)

    const reader = yield* SettingsReader
    const projectSettings = yield* reader.getProjectSettings(incident.projectId)
    if (!isIncidentNotificationEnabled(projectSettings, incident.kind)) {
      yield* Effect.annotateCurrentSpan("skipped", "incident-kind-disabled")
      return { status: "skipped", reason: "kind-disabled" } as const
    }

    const kShort = projectSettings?.escalation?.sensitivity ?? DEFAULT_ESCALATION_SENSITIVITY_K
    // Snapshot trend + tags + sample-excerpt in parallel. Closed kind
    // skips both: the recovery email focuses on the descent, not the
    // source context. Event + opened both get the excerpt so the
    // recipient sees what triggered the alert without clicking through.
    const [trend, tags, sampleExcerpt] = yield* Effect.all(
      [
        snapshotTrend({ incident, kind: notificationKind, kShort }),
        notificationKind === "incident.closed" ? Effect.succeed(undefined) : snapshotTags(incident),
        notificationKind === "incident.closed" ? Effect.succeed(undefined) : snapshotSampleExcerpt(incident),
      ],
      { concurrency: "unbounded" },
    )

    const recipients = yield* resolveRecipients({
      organizationId: incident.organizationId,
      projectId: incident.projectId,
      kind: incident.kind,
    })

    if (recipients.length === 0) {
      return { status: "skipped", reason: "no-recipients" } as const
    }

    const payload = buildPayload({ incident, kind: notificationKind, trend, tags, sampleExcerpt })
    // Per-kind switch preserves the discriminated-union narrowing
    // `buildIdempotencyKey`'s input requires. A widening cast would
    // silently lose exhaustiveness if a future kind keys off a
    // different payload field.
    const idempotencyKey: string = (() => {
      switch (notificationKind) {
        case "incident.event":
          return buildIdempotencyKey({ kind: "incident.event", payload: payload as IncidentEventPayload })
        case "incident.opened":
          return buildIdempotencyKey({ kind: "incident.opened", payload: payload as IncidentOpenedPayload })
        case "incident.closed":
          return buildIdempotencyKey({ kind: "incident.closed", payload: payload as IncidentClosedPayload })
      }
    })()

    const requests: IncidentNotificationRequest[] = recipients.map((userId) => ({
      organizationId: incident.organizationId,
      userId,
      kind: notificationKind,
      idempotencyKey,
      payload,
      notificationId: NotificationId(generateId()),
      projectId: incident.projectId,
    }))

    return { status: "ok", requests } as const
  }).pipe(Effect.withSpan("notifications.requestIncidentNotifications")) as Effect.Effect<
    RequestIncidentNotificationsResult,
    RequestIncidentNotificationsError,
    | SqlClient
    | ChSqlClient
    | AlertIncidentRepository
    | EvaluationRepository
    | MembershipRepository
    | ScoreAnalyticsRepository
    | ScoreRepository
    | SettingsReader
    | UserRepository
  >
