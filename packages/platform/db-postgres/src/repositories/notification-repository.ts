import { type Notification, NotificationRepository, notificationSchema } from "@domain/notifications"
import { SqlClient, type SqlClientShape } from "@domain/shared"
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm"
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

export const NotificationRepositoryLive = Layer.effect(
  NotificationRepository,
  Effect.succeed(
    NotificationRepository.of({
      bulkInsert: (incoming) =>
        Effect.gen(function* () {
          if (incoming.length === 0) return
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = incoming.map(toInsertRow)
          // Conflict target is the partial unique index defined in
          // `schema/notifications.ts` (`notifications_incident_event_uq`).
          // We target it explicitly — by column list + the index's WHERE
          // predicate — so PK collisions and other constraint violations
          // still surface as errors instead of being silently swallowed.
          // Done via raw SQL because Drizzle's typed `target` array
          // can't express the `(payload->>'event')` index expression.
          yield* sqlClient.query((db) =>
            db.execute(sql`
              insert into ${notifications}
                (id, organization_id, user_id, type, source_id, payload, created_at, seen_at)
              values ${sql.join(
                rows.map(
                  (r) => sql`(
                    ${r.id},
                    ${r.organizationId},
                    ${r.userId},
                    ${r.type},
                    ${r.sourceId},
                    ${JSON.stringify(r.payload)}::jsonb,
                    ${r.createdAt},
                    ${r.seenAt}
                  )`,
                ),
                sql`, `,
              )}
              on conflict (organization_id, user_id, source_id, ((payload->>'event')))
                where type = 'incident' and source_id is not null
              do nothing
            `),
          )
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

      markSeen: ({ organizationId, userId, notificationId, seenAt }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db) =>
            db
              .update(notifications)
              .set({ seenAt })
              .where(
                and(
                  eq(notifications.id, notificationId),
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
