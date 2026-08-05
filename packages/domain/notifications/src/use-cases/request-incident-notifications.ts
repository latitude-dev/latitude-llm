import { EvaluationRepository } from "@domain/evaluations"
import { type Incident, IncidentRepository, isSignalEscalationEntrySignals } from "@domain/incidents"
import type { MembershipRepository } from "@domain/organizations"
import { ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import {
  AlertIncidentId,
  type ChSqlClient,
  generateId,
  type IncidentNotificationKey,
  isIncidentNotificationEnabled,
  type NotFoundError,
  NotificationId,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  SettingsReader,
  SignalId,
  type SqlClient,
  UserId,
} from "@domain/shared"
import {
  buildHistogramBucketScaffold,
  DEFAULT_ESCALATION_SENSITIVITY_K,
  fillBuckets,
  type SignalPriority,
  SignalRepository,
} from "@domain/signals"
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
import { type IncidentMonitorInfo, IncidentMonitorReader } from "../ports/incident-monitor-reader.ts"

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
  readonly slackEligible: boolean
}

export type RequestIncidentNotificationsResult =
  | {
      readonly status: "skipped"
      readonly reason:
        | "kind-disabled"
        | "no-recipients"
        | "monitor-muted"
        | "signal-muted"
        | "signal-ignored"
        | "signal-resolved"
    }
  | { readonly status: "ok"; readonly requests: readonly IncidentNotificationRequest[] }

export type RequestIncidentNotificationsError = RepositoryError | NotFoundError

/**
 * Window/bucket size for the trend snapshot on sustained kinds. 14 days of UTC-aligned 12h
 * buckets (~28 points) — identical to the in-app issue-detail drawer (`getSignalDetail`) so the
 * Slack/email chart shows the same data at the same granularity instead of a divergent 3h zoom.
 * The window is frozen at incident time (the PNG is immutable/cached), UTC-day-aligned the same
 * way the drawer aligns to "now".
 */
type SourcedIncident = Incident

const notificationKeyForIncident = (incident: Incident): IncidentNotificationKey => {
  if (incident.sourceType === "signal") return "signal.escalating"
  if (incident.condition?.trigger === "threshold") return "monitor.threshold"
  if (incident.condition?.trigger === "escalating") return "monitor.escalating"
  return "monitor.match"
}

const TREND_BUCKET_SECONDS = 12 * 60 * 60
const TREND_LOOKBACK_DAYS = 14

/**
 * Separate fine-grained window used ONLY to derive the breach "rate climbed to X/hr" copy. The
 * 12h display buckets above are too coarse to read an hourly peak from, so the rate is computed
 * from a short recent window at 10-min resolution (the historical behaviour) — independent of the
 * widened display trend.
 */
const RATE_PEAK_WINDOW_MS = 3 * 60 * 60 * 1000
const RATE_PEAK_BUCKET_SECONDS = 600

/** End-of-UTC-day for the anchor, matching the drawer's `toUtcDayEnd` window alignment. */
const toUtcDayEnd = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999))

/** Cap on sample-excerpt text length; truncated longer feedback gets `truncated: true`. */
const SAMPLE_EXCERPT_MAX_CHARS = 200
/** Top-N tags surfaced in the email body. Sorted alphabetically (matches `SignalTagsAggregate` UI rendering). */
const TAGS_TOP_N = 5
/** History window for tag aggregation. Matches the signal-list/drawer convention. */
const TAGS_LOOKBACK_DAYS = 30

const resolveKind = (incident: Incident, transition: IncidentTransition): IncidentNotificationKind => {
  if (transition === "closed") return "incident.closed"
  // Monitor threshold incidents are sustained (open, `endedAt = null`) for dedup + tracking,
  // but alert once on open with no recovery email — the same one-shot copy as a point event.
  // So they emit `incident.event` despite being open; the close is silent (no IncidentClosed).
  if (incident.sourceType === "monitor" && incident.condition?.trigger === "threshold") return "incident.event"
  // "created" — the incident is freshly inserted. `endedAt = startedAt`
  // means an eventful kind that collapsed
  // to a point in time; otherwise it's the open side of a sustained
  // incident.
  return incident.endedAt !== null && incident.endedAt.getTime() === incident.startedAt.getTime()
    ? "incident.event"
    : "incident.opened"
}

/**
 * Snapshot the 14d/12h trend window for sustained kinds, frozen at the relevant transition
 * timestamp and UTC-day-aligned exactly like the signal-detail drawer. Zero-fills the window so
 * empty buckets render as gaps, zips in the per-bucket seasonal threshold, and carries the
 * triggering incident as a `marker` for the chart's severity band + start dot. Returns `null`
 * for `incident.event` (one-shot kinds have nothing to trend at notification time).
 */
const snapshotTrend = (input: {
  readonly incident: SourcedIncident
  readonly kind: IncidentNotificationKind
  readonly kShort: number
}) =>
  Effect.gen(function* () {
    const { incident, kind, kShort } = input
    if (kind === "incident.event") return null

    const anchor = kind === "incident.closed" && incident.endedAt !== null ? incident.endedAt : incident.startedAt
    const to = toUtcDayEnd(anchor)
    const from = new Date(to)
    from.setUTCDate(from.getUTCDate() - (TREND_LOOKBACK_DAYS - 1))
    from.setUTCHours(0, 0, 0, 0)

    const scaffold = buildHistogramBucketScaffold({ from, to, bucketSeconds: TREND_BUCKET_SECONDS })

    const analytics = yield* ScoreAnalyticsRepository
    const [counts, thresholds] = yield* Effect.all([
      analytics.histogramBySignals({
        organizationId: incident.organizationId,
        projectId: incident.projectId,
        signalIds: [SignalId(incident.sourceId)],
        timeRange: { from, to },
        bucketSeconds: TREND_BUCKET_SECONDS,
      }),
      analytics.escalationThresholdHistogramBySignals({
        organizationId: incident.organizationId,
        projectId: incident.projectId,
        signalIds: [SignalId(incident.sourceId)],
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
    // same way `SignalTrendBar` does today.
    const thresholdByBucket = new Map<string, number | null>()
    for (const entry of thresholds[0]?.buckets ?? []) {
      thresholdByBucket.set(entry.bucket, Number.isFinite(entry.thresholdCount) ? entry.thresholdCount : null)
    }

    const points: IncidentTrend["points"] = fillBuckets({ scaffold, buckets: counts }).map((bucket) => ({
      t: bucket.bucket,
      count: bucket.count,
      threshold: thresholdByBucket.get(bucket.bucket) ?? null,
    }))

    const marker: IncidentTrend["marker"] = {
      startedAt: incident.startedAt.toISOString(),
      endedAt: incident.endedAt !== null ? incident.endedAt.toISOString() : null,
      severity: incident.severity,
    }

    return { bucketDurationMs: TREND_BUCKET_SECONDS * 1000, points, marker } as const
  })

/**
 * Peak occurrences/hour over a short recent window at 10-min resolution, used solely for the
 * breach "rate climbed to X/hr" copy (the 12h display trend is too coarse to read an hourly rate
 * from). Anchored at incident open. Returns `0` when there's no data in the window.
 */
const snapshotTriggerRatePerHour = (incident: SourcedIncident) =>
  Effect.gen(function* () {
    const to = incident.startedAt
    const from = new Date(to.getTime() - RATE_PEAK_WINDOW_MS)
    const analytics = yield* ScoreAnalyticsRepository
    const counts = yield* analytics.histogramBySignals({
      organizationId: incident.organizationId,
      projectId: incident.projectId,
      signalIds: [SignalId(incident.sourceId)],
      timeRange: { from, to },
      bucketSeconds: RATE_PEAK_BUCKET_SECONDS,
    })
    const peakCount = counts.reduce((max, bucket) => (bucket.count > max ? bucket.count : max), 0)
    const bucketHours = RATE_PEAK_BUCKET_SECONDS / (60 * 60)
    return bucketHours > 0 ? peakCount / bucketHours : 0
  })

/**
 * Snapshot the top-N tags from the signal's recent traces. Sorted
 * alphabetically (matches the `SignalTagsAggregate` UI rendering) and
 * sliced so the email body stays compact. Returns `undefined` when
 * there are no tags so the template can skip the chips block.
 */
const snapshotTags = (incident: SourcedIncident) =>
  Effect.gen(function* () {
    const analytics = yield* ScoreAnalyticsRepository
    const from = new Date(Date.now() - TAGS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    const aggregates = yield* analytics.aggregateTagsBySignals({
      organizationId: incident.organizationId,
      projectId: incident.projectId,
      signalIds: [SignalId(incident.sourceId)],
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
const snapshotSampleExcerpt = (incident: SourcedIncident) =>
  Effect.gen(function* () {
    const scores = yield* ScoreRepository
    const truncate = (text: string): IncidentSampleExcerpt["text"] => text.slice(0, SAMPLE_EXCERPT_MAX_CHARS)

    const annotations = yield* scores.listBySignalId({
      projectId: incident.projectId,
      signalId: SignalId(incident.sourceId),
      source: "annotation",
      options: { limit: 1 },
    })
    const latestAnnotation = annotations.items[0]
    if (latestAnnotation && latestAnnotation.sourceType === "annotation") {
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

    const evaluations = yield* scores.listBySignalId({
      projectId: incident.projectId,
      signalId: SignalId(incident.sourceId),
      source: "evaluation",
      options: { limit: 1 },
    })
    const latestEvaluation = evaluations.items[0]
    if (
      latestEvaluation &&
      latestEvaluation.sourceType === "evaluation" &&
      latestEvaluation.feedback.trim().length > 0
    ) {
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

/** Signal triage state snapshotted onto incident payloads at producer time. */
interface SignalTriageSnapshot {
  readonly assigneeId: string | null
  readonly priority: SignalPriority | null
}

/**
 * Snapshot the signal's triage fields (assignee + priority) so renderers can
 * show who owns the signal and how urgent it was deemed when the incident
 * fired. Only meaningful for signal-sourced incidents; a missing signal row
 * (deleted between the incident and this producer) degrades to `null` so the
 * payload simply omits the fields, like legacy rows.
 */
const snapshotSignalTriage = (incident: SourcedIncident) =>
  Effect.gen(function* () {
    const issues = yield* SignalRepository
    const issue = yield* issues
      .findById(SignalId(incident.sourceId))
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    if (issue === null) return null
    return { assigneeId: issue.assigneeId, priority: issue.priority } satisfies SignalTriageSnapshot
  })

/**
 * Snapshot breach scalars for the opened-side email copy. Returns
 * `undefined` for legacy escalating incidents that don't have
 * `entrySignals` — those predate the seasonal detector's snapshot.
 *
 * `triggerRate` is the recent fine-grained peak/hour from
 * {@link snapshotTriggerRatePerHour} (the display trend is now 12h-bucketed and too coarse for
 * an hourly rate). The exact instantaneous rate that tripped entry isn't preserved on the
 * incident row, but this peak is the "climbed to" figure the copy describes.
 */
const buildBreach = (incident: Incident, triggerRatePerHour: number | null): IncidentBreach | undefined => {
  if (!isSignalEscalationEntrySignals(incident.entrySignals)) return undefined
  return {
    triggerRate: triggerRatePerHour ?? 0,
    baselineRate: incident.entrySignals.expected1h,
    threshold: incident.entrySignals.entryThreshold1h,
  }
}

/**
 * Snapshot recovery scalars for the closed-side email copy. Duration
 * is `endedAt - startedAt` in ms; the template humanizes ("elevated
 * for 32m").
 */
const buildRecovery = (incident: Incident): IncidentRecovery => ({
  durationMs: incident.endedAt !== null ? Math.max(0, incident.endedAt.getTime() - incident.startedAt.getTime()) : 0,
})

const buildPayload = (input: {
  readonly incident: SourcedIncident
  readonly kind: IncidentNotificationKind
  readonly trend: IncidentTrend | null
  readonly triggerRatePerHour: number | null
  readonly tags: readonly string[] | undefined
  readonly sampleExcerpt: IncidentSampleExcerpt | undefined
  readonly monitor: IncidentMonitorInfo | null
  readonly triage: SignalTriageSnapshot | null
}): IncidentEventPayload | IncidentOpenedPayload | IncidentClosedPayload => {
  const { incident, kind, trend, triggerRatePerHour, tags, sampleExcerpt, monitor, triage } = input
  const base = {
    alertIncidentId: incident.id,
    sourceType: incident.sourceType,
    sourceId: incident.sourceId,
    incidentKind: notificationKeyForIncident(incident),
    severity: incident.severity,
  } as const
  // Monitor attribution + condition, spread into every variant; empty on legacy incidents.
  const attribution = {
    ...(monitor ? { monitorId: monitor.monitorId, monitorName: monitor.name, monitorSlug: monitor.slug } : {}),
    ...(incident.condition !== null ? { condition: incident.condition } : {}),
  }
  // Signal triage snapshot, spread into every variant (incl. closed — the
  // recovery email still shows who owns the signal); absent for monitor
  // sources and when the signal row vanished.
  const triageFields = triage ? { assigneeId: triage.assigneeId, priority: triage.priority } : {}

  const mutableTags = tags ? [...tags] : undefined
  if (kind === "incident.event") {
    return {
      alertIncidentId: base.alertIncidentId,
      sourceType: base.sourceType,
      sourceId: base.sourceId,
      incidentKind: base.incidentKind,
      severity: base.severity,
      ...attribution,
      ...triageFields,
      ...(mutableTags ? { tags: mutableTags } : {}),
      ...(sampleExcerpt ? { sampleExcerpt } : {}),
    }
  }
  // Sustained signal incidents carry a signal trend snapshot; monitor incidents
  // render from their monitor attribution and condition.
  if (kind === "incident.opened") {
    const breach = buildBreach(incident, triggerRatePerHour)
    return {
      alertIncidentId: base.alertIncidentId,
      sourceType: base.sourceType,
      sourceId: base.sourceId,
      incidentKind: base.incidentKind,
      severity: base.severity,
      ...attribution,
      ...triageFields,
      ...(trend ? { trend } : {}),
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
    ...attribution,
    ...triageFields,
    ...(trend ? { trend } : {}),
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

    const incidentRepo = yield* IncidentRepository
    const incident = yield* incidentRepo.findById(AlertIncidentId(input.alertIncidentId))

    const monitor =
      incident.sourceType === "monitor"
        ? yield* (yield* IncidentMonitorReader).findByMonitorId(incident.sourceId)
        : null
    if (monitor?.mutedAt !== null && monitor?.mutedAt !== undefined) {
      yield* Effect.annotateCurrentSpan("skipped", "monitor-muted")
      return { status: "skipped", reason: "monitor-muted" } as const
    }
    const signal =
      incident.sourceType === "signal"
        ? yield* (yield* SignalRepository)
            .findById(SignalId(incident.sourceId))
            .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
        : null
    if (signal?.mutedAt !== null && signal?.mutedAt !== undefined) {
      yield* Effect.annotateCurrentSpan("skipped", "signal-muted")
      return { status: "skipped", reason: "signal-muted" } as const
    }
    // Ignored signals normally never open incidents; this covers the race
    // where an ignore lands between the incident opening and this fan-out.
    if (signal?.ignoredAt !== null && signal?.ignoredAt !== undefined) {
      yield* Effect.annotateCurrentSpan("skipped", "signal-ignored")
      return { status: "skipped", reason: "signal-ignored" } as const
    }
    // Same race for resolve: the manual close already suppressed the recovery
    // notification, so a still-queued open must not ping for an archived signal.
    if (signal?.resolvedAt !== null && signal?.resolvedAt !== undefined) {
      yield* Effect.annotateCurrentSpan("skipped", "signal-resolved")
      return { status: "skipped", reason: "signal-resolved" } as const
    }
    // No "unjudged ⇒ no delivery" gate here, deliberately: escalation is its own
    // evidence of urgency (the occurrence rate broke its seasonal band), which is
    // independent of how bad the mechanism is. The incident carries the signal's
    // level when it has one and `"high"` when it does not, so an untriaged signal
    // that starts spiking still pages — 97% of production escalations come from
    // signals nobody has triaged. The unjudged rule applies to discovery, where
    // there is no such evidence.

    const notificationKind = resolveKind(incident, input.transition)
    yield* Effect.annotateCurrentSpan("kind", notificationKind)

    const reader = yield* SettingsReader
    const projectSettings = yield* reader.getProjectSettings(incident.projectId)
    const incidentNotificationKey = notificationKeyForIncident(incident)
    if (!isIncidentNotificationEnabled(projectSettings, incidentNotificationKey)) {
      yield* Effect.annotateCurrentSpan("skipped", "incident-kind-disabled")
      return { status: "skipped", reason: "kind-disabled" } as const
    }

    // Prefer the sensitivity snapshotted on the incident's condition (so the chart's
    // threshold line matches what tripped it); fall back to project settings.
    const snapshotSensitivity =
      incident.condition?.trigger === "escalating" ? incident.condition.sensitivity : undefined
    const kShort = snapshotSensitivity ?? projectSettings?.escalation?.sensitivity ?? DEFAULT_ESCALATION_SENSITIVITY_K
    // Trend / tags / sample-excerpt are all keyed on signal analytics; monitor incidents render
    // from the kind + monitor attribution + condition.
    // Closed kind also skips tags/excerpt: the recovery copy focuses on the descent.
    const isSignalSource = incident.sourceType === "signal"
    const wantsSourceContext = isSignalSource && notificationKind !== "incident.closed"
    const [trend, triggerRatePerHour, tags, sampleExcerpt, triage] = yield* Effect.all(
      [
        isSignalSource ? snapshotTrend({ incident, kind: notificationKind, kShort }) : Effect.succeed(null),
        // Only the opened-side breach copy needs the fine-grained hourly rate (issue sources only).
        isSignalSource && notificationKind === "incident.opened"
          ? snapshotTriggerRatePerHour(incident)
          : Effect.succeed(null),
        wantsSourceContext ? snapshotTags(incident) : Effect.succeed(undefined),
        wantsSourceContext ? snapshotSampleExcerpt(incident) : Effect.succeed(undefined),
        isSignalSource ? snapshotSignalTriage(incident) : Effect.succeed(null),
      ],
      { concurrency: "unbounded" },
    )

    const hasSignalAssignee = Boolean(signal?.assigneeId)
    let recipients: readonly UserId[]
    if (signal?.assigneeId) {
      recipients = [UserId(signal.assigneeId)]
    } else {
      recipients = yield* resolveRecipients({
        organizationId: incident.organizationId,
        projectId: incident.projectId,
        kind: incidentNotificationKey,
      })
    }

    if (recipients.length === 0) {
      return { status: "skipped", reason: "no-recipients" } as const
    }

    const payload = buildPayload({
      incident,
      kind: notificationKind,
      trend,
      triggerRatePerHour,
      tags,
      sampleExcerpt,
      monitor,
      triage,
    })
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
      slackEligible: !hasSignalAssignee,
    }))

    return { status: "ok", requests } as const
  }).pipe(Effect.withSpan("notifications.requestIncidentNotifications")) as Effect.Effect<
    RequestIncidentNotificationsResult,
    RequestIncidentNotificationsError,
    | SqlClient
    | ChSqlClient
    | IncidentRepository
    | EvaluationRepository
    | IncidentMonitorReader
    | SignalRepository
    | MembershipRepository
    | ScoreAnalyticsRepository
    | ScoreRepository
    | SettingsReader
    | UserRepository
  >
