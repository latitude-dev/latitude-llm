import { type AlertIncident, AlertIncidentRepository } from "@domain/alerts"
import { DEFAULT_ESCALATION_SENSITIVITY_K } from "@domain/issues"
import type { MembershipRepository } from "@domain/organizations"
import { ScoreAnalyticsRepository } from "@domain/scores"
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
  type UserId,
} from "@domain/shared"
import { Effect } from "effect"
import type {
  IncidentClosedPayload,
  IncidentEventPayload,
  IncidentOpenedPayload,
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

const buildPayload = (input: {
  readonly incident: AlertIncident
  readonly kind: IncidentNotificationKind
  readonly trend: IncidentTrend | null
}): IncidentEventPayload | IncidentOpenedPayload | IncidentClosedPayload => {
  const { incident, kind, trend } = input
  const base = {
    alertIncidentId: incident.id,
    sourceType: incident.sourceType,
    sourceId: incident.sourceId,
    incidentKind: incident.kind,
    severity: incident.severity,
  } as const

  if (kind === "incident.event") return base
  // Sustained kinds must carry the trend snapshot (caller guarantees it).
  if (trend === null) throw new Error(`Missing trend snapshot for ${kind}`)
  return { ...base, trend }
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
    const trend = yield* snapshotTrend({ incident, kind: notificationKind, kShort })

    const recipients = yield* resolveRecipients({
      organizationId: incident.organizationId,
      projectId: incident.projectId,
      kind: incident.kind,
    })

    if (recipients.length === 0) {
      return { status: "skipped", reason: "no-recipients" } as const
    }

    const payload = buildPayload({ incident, kind: notificationKind, trend })
    const idempotencyKey = buildIdempotencyKey({ kind: notificationKind, payload } as Parameters<
      typeof buildIdempotencyKey
    >[0])

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
    SqlClient | ChSqlClient | AlertIncidentRepository | MembershipRepository | ScoreAnalyticsRepository | SettingsReader
  >
