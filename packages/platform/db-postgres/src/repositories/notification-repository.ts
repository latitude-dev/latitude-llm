import { type Notification, NotificationRepository, notificationSchema } from "@domain/notifications"
import { NotFoundError, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { notifications } from "../schema/notifications.ts"

const toInsertRow = (n: Notification): typeof notifications.$inferInsert => ({
  id: n.id,
  organizationId: n.organizationId,
  userId: n.userId,
  kind: n.kind,
  idempotencyKey: n.idempotencyKey,
  projectId: n.projectId,
  payload: n.payload,
  createdAt: n.createdAt,
  seenAt: n.seenAt,
  emailedAt: n.emailedAt,
})

const toDomain = (row: typeof notifications.$inferSelect): Notification =>
  notificationSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    kind: row.kind,
    idempotencyKey: row.idempotencyKey,
    projectId: row.projectId,
    payload: row.payload,
    createdAt: row.createdAt,
    seenAt: row.seenAt,
    emailedAt: row.emailedAt,
  })

export const NotificationRepositoryLive = Layer.effect(
  NotificationRepository,
  Effect.succeed(
    NotificationRepository.of({
      insertIfAbsent: (row) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const inserted = yield* sqlClient.query((db) =>
            db
              .insert(notifications)
              .values(toInsertRow(row))
              // The unique index target — see schema/notifications.ts.
              .onConflictDoNothing({
                target: [notifications.organizationId, notifications.userId, notifications.idempotencyKey],
              })
              .returning(),
          )
          const [first] = inserted
          return first ? toDomain(first) : null
        }),

      findById: (id) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db.select().from(notifications).where(eq(notifications.id, id)).limit(1),
          )
          const [first] = rows
          if (!first) return yield* Effect.fail(new NotFoundError({ entity: "Notification", id }))
          return toDomain(first)
        }),

      markEmailed: (id) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const updated = yield* sqlClient.query((db) =>
            db
              .update(notifications)
              .set({ emailedAt: new Date() })
              .where(and(eq(notifications.id, id), isNull(notifications.emailedAt)))
              .returning({ id: notifications.id }),
          )
          return updated.length > 0
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

      deleteByProjectId: ({ organizationId, projectId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const deleted = yield* sqlClient.query((db) =>
            db
              .delete(notifications)
              .where(and(eq(notifications.organizationId, organizationId), eq(notifications.projectId, projectId)))
              .returning({ id: notifications.id }),
          )
          return { deleted: deleted.length }
        }),
    }),
  ),
)
