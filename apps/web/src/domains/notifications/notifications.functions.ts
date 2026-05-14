import { AlertIncidentRepository } from "@domain/alerts"
import { IssueRepository } from "@domain/issues"
import {
  getUnreadNotificationCountUseCase,
  INCIDENT_NOTIFICATION_EVENTS,
  listNotificationsUseCase,
  markAllNotificationsSeenUseCase,
  markNotificationSeenUseCase,
  type Notification,
} from "@domain/notifications"
import { ProjectRepository } from "@domain/projects"
import { type IssueOccurrenceBucket, ScoreAnalyticsRepository } from "@domain/scores"
import { AlertIncidentId, IssueId } from "@domain/shared"
import { ScoreAnalyticsRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  AlertIncidentRepositoryLive,
  IssueRepositoryLive,
  NotificationRepositoryLive,
  ProjectRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
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
type JsonRecord = Readonly<Record<string, object>>

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

export const markNotificationSeen = createServerFn({ method: "POST" })
  .inputValidator(z.object({ notificationId: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const { userId, organizationId } = await requireSession()
    const pgClient = getPostgresClient()

    await Effect.runPromise(
      markNotificationSeenUseCase({ organizationId, userId, notificationId: data.notificationId }).pipe(
        withPostgres(NotificationRepositoryLive, pgClient, organizationId),
        withTracing,
      ),
    )
  })

const DAY_MS = 24 * 60 * 60 * 1000
const NOTIFICATION_TREND_BUCKET_SECONDS = 12 * 60 * 60

interface IncidentTrendResult {
  readonly buckets: readonly IssueOccurrenceBucket[]
}

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
    // Pre-incident history matters — the chart shows issue activity, not incident state.
    const from = new Date(center - DAY_MS)
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

export interface IncidentTargetResult {
  readonly issueId: string | null
  readonly issueName: string | null
  readonly projectId: string | null
  readonly projectSlug: string | null
}

// Fallback for incident notifications whose payload snapshot is missing fields:
// the alert_incident row carries the issue + project ids authoritatively.
export const getIncidentNotificationTarget = createServerFn({ method: "GET" })
  .inputValidator(z.object({ alertIncidentId: z.string() }))
  .handler(async ({ data }): Promise<IncidentTargetResult> => {
    const { organizationId } = await requireSession()
    const pgClient = getPostgresClient()

    return await Effect.runPromise(
      Effect.gen(function* () {
        const incidentRepo = yield* AlertIncidentRepository
        const incident = yield* incidentRepo.findById(AlertIncidentId(data.alertIncidentId))

        const issueRepo = yield* IssueRepository
        const projectRepo = yield* ProjectRepository
        const issue = yield* issueRepo
          .findById(IssueId(incident.sourceId))
          .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
        const project = yield* projectRepo
          .findById(incident.projectId)
          .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

        return {
          issueId: issue?.id ?? null,
          issueName: issue?.name ?? null,
          projectId: project?.id ?? null,
          projectSlug: project?.slug ?? null,
        }
      }).pipe(
        withPostgres(
          Layer.mergeAll(AlertIncidentRepositoryLive, IssueRepositoryLive, ProjectRepositoryLive),
          pgClient,
          organizationId,
        ),
        withTracing,
      ),
    )
  })
