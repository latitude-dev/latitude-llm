import {
  getUnreadNotificationCountUseCase,
  listNotificationsUseCase,
  markAllNotificationsSeenUseCase,
  type Notification,
} from "@domain/notifications"
import { NotificationRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"

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
