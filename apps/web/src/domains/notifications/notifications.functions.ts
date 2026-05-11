import { AlertIncidentRepository } from "@domain/alerts"
import {
  getUnreadNotificationCountUseCase,
  INCIDENT_NOTIFICATION_EVENTS,
  listNotificationsUseCase,
  markAllNotificationsSeenUseCase,
  type Notification,
} from "@domain/notifications"
import { type IssueOccurrenceBucket, ScoreAnalyticsRepository } from "@domain/scores"
import { AlertIncidentId, IssueId } from "@domain/shared"
import { ScoreAnalyticsRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { AlertIncidentRepositoryLive, NotificationRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getClickhouseClient, getPostgresClient } from "../../server/clients.ts"

const notificationCursorSchema = z.object({
  createdAt: z.iso.datetime(),
  id: z.string(),
})

// `payload` is a JSON object whose shape depends on `type`. The renderer
// narrows it via `incidentNotificationPayloadSchema` /
// `customMessageNotificationPayloadSchema` at the consumption site.
// Index signature uses `{}` to match TanStack Start's JSON-serialized return
// inference (Record<string, unknown> would over-narrow during the round-trip).
type JsonRecord = Readonly<Record<string, {}>>

export interface NotificationRecord {
  readonly id: string
  readonly type: Notification["type"]
  readonly sourceId: string | null
  readonly payload: JsonRecord
  readonly createdAt: string
  readonly seenAt: string | null
}

const toNotificationRecord = (n: Notification): NotificationRecord => ({
  id: n.id,
  type: n.type,
  sourceId: n.sourceId,
  payload: n.payload as JsonRecord,
  createdAt: n.createdAt.toISOString(),
  seenAt: n.seenAt?.toISOString() ?? null,
})

interface ListNotificationsResultRecord {
  readonly items: readonly NotificationRecord[]
  readonly nextCursor: { readonly createdAt: string; readonly id: string } | null
  readonly hasMore: boolean
}

export const listNotifications = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      limit: z.number().int().min(1).max(50).default(10),
      cursor: notificationCursorSchema.optional(),
    }),
  )
  .handler(async ({ data }): Promise<ListNotificationsResultRecord> => {
    const { userId, organizationId } = await requireSession()
    const pgClient = getPostgresClient()

    const page = await Effect.runPromise(
      listNotificationsUseCase({
        organizationId,
        userId,
        limit: data.limit,
        ...(data.cursor ? { cursor: { createdAt: new Date(data.cursor.createdAt), id: data.cursor.id } } : {}),
      }).pipe(withPostgres(NotificationRepositoryLive, pgClient, organizationId), withTracing),
    )

    return {
      items: page.items.map(toNotificationRecord),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor
        ? { createdAt: page.nextCursor.createdAt.toISOString(), id: page.nextCursor.id }
        : null,
    }
  })

export const getUnreadNotificationCount = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ readonly count: number }> => {
    const { userId, organizationId } = await requireSession()
    const pgClient = getPostgresClient()

    const count = await Effect.runPromise(
      getUnreadNotificationCountUseCase({ organizationId, userId }).pipe(
        withPostgres(NotificationRepositoryLive, pgClient, organizationId),
        withTracing,
      ),
    )

    return { count }
  },
)

export const markAllNotificationsSeen = createServerFn({ method: "POST" }).handler(async (): Promise<void> => {
  const { userId, organizationId } = await requireSession()
  const pgClient = getPostgresClient()

  await Effect.runPromise(
    markAllNotificationsSeenUseCase({ organizationId, userId }).pipe(
      withPostgres(NotificationRepositoryLive, pgClient, organizationId),
      withTracing,
    ),
  )
})

const DAY_MS = 24 * 60 * 60 * 1000
// 12h buckets — matches the issue detail drawer, gives ~4 bars across the
// ±1 day window the notification card renders.
const NOTIFICATION_TREND_BUCKET_SECONDS = 12 * 60 * 60

interface IncidentTrendResult {
  readonly buckets: readonly IssueOccurrenceBucket[]
}

/**
 * Returns the per-day trend buckets for the issue tied to an alert incident,
 * scoped to a tight window around the moment the notification cares about:
 *   - `event: "opened"` → ±1 day around `incident.startedAt`
 *   - `event: "closed"` → ±1 day around `incident.endedAt`
 *
 * The window is clamped to `[incident.startedAt, now]` so we never query
 * before the incident's lifetime started or past the present.
 */
export const getIncidentTrend = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      alertIncidentId: z.string(),
      event: z.enum(INCIDENT_NOTIFICATION_EVENTS),
    }),
  )
  .handler(async ({ data }): Promise<IncidentTrendResult> => {
    const { organizationId } = await requireSession()
    const pgClient = getPostgresClient()
    const chClient = getClickhouseClient()

    const incident = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* AlertIncidentRepository
        return yield* repo.findById(AlertIncidentId(data.alertIncidentId))
      }).pipe(withPostgres(AlertIncidentRepositoryLive, pgClient, organizationId), withTracing),
    )

    const now = Date.now()
    const center = (data.event === "closed" ? incident.endedAt?.getTime() : incident.startedAt.getTime()) ?? now
    // Clamp: never query before the incident started, or past now.
    const from = new Date(Math.max(center - DAY_MS, incident.startedAt.getTime()))
    const to = new Date(Math.min(center + DAY_MS, now))

    const buckets = await Effect.runPromise(
      Effect.gen(function* () {
        const analytics = yield* ScoreAnalyticsRepository
        return yield* analytics.histogramByIssues({
          organizationId: incident.organizationId,
          projectId: incident.projectId,
          issueIds: [IssueId(incident.sourceId)],
          timeRange: { from, to },
          bucketSeconds: NOTIFICATION_TREND_BUCKET_SECONDS,
        })
      }).pipe(withClickHouse(ScoreAnalyticsRepositoryLive, chClient, organizationId), withTracing),
    )

    return { buckets }
  })
