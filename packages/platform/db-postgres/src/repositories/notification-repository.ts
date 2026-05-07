import { type Notification, NotificationRepository, notificationSchema } from "@domain/notifications"
import { SqlClient, type SqlClientShape } from "@domain/shared"
import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { notifications } from "../schema/notifications.ts"

const toInsertRow = (n: Notification): typeof notifications.$inferInsert => ({
  id: n.id,
  organizationId: n.organizationId,
  userId: n.userId,
  type: n.type,
  sourceId: n.sourceId,
  payload: n.payload,
  createdAt: n.createdAt,
  seenAt: n.seenAt,
})

const toDomain = (row: typeof notifications.$inferSelect): Notification =>
  notificationSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    type: row.type,
    sourceId: row.sourceId,
    payload: row.payload,
    createdAt: row.createdAt,
    seenAt: row.seenAt,
  })

void asc // keep import for potential reuse; tree-shaken at build time

export const NotificationRepositoryLive = Layer.effect(
  NotificationRepository,
  Effect.succeed(
    NotificationRepository.of({
      bulkInsert: (incoming) =>
        Effect.gen(function* () {
          if (incoming.length === 0) return
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = incoming.map(toInsertRow)
          // The partial unique index on (org, user, source_id, payload->>event)
          // dedupes incident notifications under outbox redelivery; rows that
          // collide are silently dropped.
          yield* sqlClient.query((db) => db.insert(notifications).values(rows).onConflictDoNothing())
        }),

      list: ({ organizationId, userId, limit, cursor }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) => {
            const baseFilter = and(eq(notifications.organizationId, organizationId), eq(notifications.userId, userId))
            const where = cursor
              ? and(
                  baseFilter,
                  or(
                    lt(notifications.createdAt, cursor.createdAt),
                    and(eq(notifications.createdAt, cursor.createdAt), lt(notifications.id, cursor.id)),
                  ),
                )
              : baseFilter
            return db
              .select()
              .from(notifications)
              .where(where)
              .orderBy(desc(notifications.createdAt), desc(notifications.id))
              .limit(limit + 1)
          })

          const items = rows.slice(0, limit).map(toDomain)
          const hasMore = rows.length > limit
          const last = items[items.length - 1]
          return {
            items,
            hasMore,
            nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
          }
        }),

      countUnread: ({ organizationId, userId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(notifications)
              .where(
                and(
                  eq(notifications.organizationId, organizationId),
                  eq(notifications.userId, userId),
                  isNull(notifications.seenAt),
                ),
              ),
          )
          return rows[0]?.count ?? 0
        }),

      markAllSeen: ({ organizationId, userId, seenAt }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db) =>
            db
              .update(notifications)
              .set({ seenAt })
              .where(
                and(
                  eq(notifications.organizationId, organizationId),
                  eq(notifications.userId, userId),
                  isNull(notifications.seenAt),
                ),
              ),
          )
        }),
    }),
  ),
)
