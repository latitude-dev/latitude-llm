import {
  type AnnotationQueueItem,
  type AnnotationQueueItemListSortBy,
  AnnotationQueueItemRepository,
  type AnnotationQueueItemRepositoryShape,
  annotationQueueItemSchema,
  annotationQueueItemStatusRankFromTimestamps,
} from "@domain/annotation-queues"
import { NotFoundError, RepositoryError, SqlClient, type SqlClientShape, TraceId } from "@domain/shared"
import { and, asc, desc, eq, gt, lt, or, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { annotationQueueItems } from "../schema/annotation-queues.ts"

const DEFAULT_LIMIT = 50

const statusRankSql = sql<number>`CASE
  WHEN ${annotationQueueItems.completedAt} IS NOT NULL THEN 2
  WHEN ${annotationQueueItems.reviewStartedAt} IS NOT NULL THEN 1
  ELSE 0
END`

const toDomainItem = (row: typeof annotationQueueItems.$inferSelect): AnnotationQueueItem =>
  annotationQueueItemSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    queueId: row.queueId,
    traceId: TraceId(row.traceId),
    traceCreatedAt: row.traceCreatedAt,
    completedAt: row.completedAt,
    completedBy: row.completedBy,
    reviewStartedAt: row.reviewStartedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const resolveSort = (
  sortBy: AnnotationQueueItemListSortBy | undefined,
  sortDirection: "asc" | "desc" | undefined,
): {
  sortBy: AnnotationQueueItemListSortBy
  sortDirection: "asc" | "desc"
} => ({
  sortBy: sortBy ?? "status",
  sortDirection: sortDirection ?? "asc",
})

const cursorWhereTraceCreatedAt = (sortDirection: "asc" | "desc", cursor: { sortValue: string; id: string }) => {
  const traceCreatedAt = new Date(cursor.sortValue)
  if (Number.isNaN(traceCreatedAt.getTime())) {
    return null
  }
  if (sortDirection === "desc") {
    return or(
      lt(annotationQueueItems.traceCreatedAt, traceCreatedAt),
      and(eq(annotationQueueItems.traceCreatedAt, traceCreatedAt), lt(annotationQueueItems.id, cursor.id)),
    )
  }
  return or(
    gt(annotationQueueItems.traceCreatedAt, traceCreatedAt),
    and(eq(annotationQueueItems.traceCreatedAt, traceCreatedAt), gt(annotationQueueItems.id, cursor.id)),
  )
}

const cursorWhereStatus = (
  sortDirection: "asc" | "desc",
  cursor: { sortValue: string; id: string; statusRank: number },
) => {
  const cr = cursor.statusRank
  if (cr < 0 || cr > 2) {
    return null
  }
  const traceCreatedAt = new Date(cursor.sortValue)
  if (Number.isNaN(traceCreatedAt.getTime())) {
    return null
  }

  if (sortDirection === "asc") {
    return or(
      gt(statusRankSql, cr),
      and(eq(statusRankSql, cr), lt(annotationQueueItems.traceCreatedAt, traceCreatedAt)),
      and(
        eq(statusRankSql, cr),
        eq(annotationQueueItems.traceCreatedAt, traceCreatedAt),
        lt(annotationQueueItems.id, cursor.id),
      ),
    )
  }
  return or(
    lt(statusRankSql, cr),
    and(eq(statusRankSql, cr), lt(annotationQueueItems.traceCreatedAt, traceCreatedAt)),
    and(
      eq(statusRankSql, cr),
      eq(annotationQueueItems.traceCreatedAt, traceCreatedAt),
      lt(annotationQueueItems.id, cursor.id),
    ),
  )
}

const orderClause = (sortBy: AnnotationQueueItemListSortBy, sortDirection: "asc" | "desc") => {
  if (sortBy === "createdAt") {
    const primary = sortDirection === "desc" ? desc : asc
    const idOrd = sortDirection === "desc" ? desc(annotationQueueItems.id) : asc(annotationQueueItems.id)
    return [primary(annotationQueueItems.traceCreatedAt), idOrd] as const
  }

  const rankOrd = sortDirection === "asc" ? asc(statusRankSql) : desc(statusRankSql)
  return [rankOrd, desc(annotationQueueItems.traceCreatedAt), desc(annotationQueueItems.id)] as const
}

const tailToCursor = (sortBy: AnnotationQueueItemListSortBy, tail: typeof annotationQueueItems.$inferSelect) => {
  const base = {
    sortValue: tail.traceCreatedAt.toISOString(),
    id: tail.id,
  } as const
  if (sortBy === "status") {
    return {
      ...base,
      statusRank: annotationQueueItemStatusRankFromTimestamps(tail.completedAt, tail.reviewStartedAt),
    } as const
  }
  return base
}

const cursorWhere = (
  sortBy: AnnotationQueueItemListSortBy,
  sortDirection: "asc" | "desc",
  cursor: { sortValue: string; id: string; statusRank?: number },
) => {
  if (sortBy === "createdAt") {
    return cursorWhereTraceCreatedAt(sortDirection, cursor)
  }
  if (cursor.statusRank === undefined) {
    return null
  }
  return cursorWhereStatus(sortDirection, {
    sortValue: cursor.sortValue,
    id: cursor.id,
    statusRank: cursor.statusRank,
  })
}

export const AnnotationQueueItemRepositoryLive = Layer.effect(
  AnnotationQueueItemRepository,
  Effect.gen(function* () {
    yield* SqlClient

    return {
      findById: ({ projectId, queueId, itemId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(annotationQueueItems)
                .where(
                  and(
                    eq(annotationQueueItems.organizationId, organizationId),
                    eq(annotationQueueItems.projectId, projectId),
                    eq(annotationQueueItems.queueId, queueId),
                    eq(annotationQueueItems.id, itemId),
                  ),
                )
                .limit(1),
            )
            .pipe(
              Effect.map((rows) => (rows[0] ? toDomainItem(rows[0]) : null)),
              Effect.mapError((cause) => new RepositoryError({ operation: "findById", cause })),
            )
        }),

      listByQueue: ({ projectId, queueId, options }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const limit = options.limit ?? DEFAULT_LIMIT
          const { sortBy, sortDirection } = resolveSort(options.sortBy, options.sortDirection)
          const cursorClause = options.cursor ? cursorWhere(sortBy, sortDirection, options.cursor) : undefined
          if (options.cursor && cursorClause === null) {
            return yield* new RepositoryError({
              operation: "listByQueue",
              cause: new Error("Invalid item list cursor"),
            })
          }

          const orders = orderClause(sortBy, sortDirection)

          return yield* sqlClient
            .query((db, organizationId) => {
              const whereBase = and(
                eq(annotationQueueItems.organizationId, organizationId),
                eq(annotationQueueItems.projectId, projectId),
                eq(annotationQueueItems.queueId, queueId),
              )
              const where = cursorClause ? and(whereBase, cursorClause) : whereBase

              return db
                .select()
                .from(annotationQueueItems)
                .where(where)
                .orderBy(...orders)
                .limit(limit + 1)
            })
            .pipe(
              Effect.map((rows) => {
                const hasMore = rows.length > limit
                const pageRows = rows.slice(0, limit)
                const items = pageRows.map(toDomainItem)
                const tail = pageRows[pageRows.length - 1]
                const nextCursor = hasMore && tail !== undefined ? tailToCursor(sortBy, tail) : undefined
                return {
                  items,
                  hasMore,
                  ...(nextCursor !== undefined ? { nextCursor } : {}),
                }
              }),
              Effect.mapError((cause) => new RepositoryError({ operation: "listByQueue", cause })),
            )
        }),

      insertIfNotExists: ({ projectId, queueId, traceId, traceCreatedAt }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .insert(annotationQueueItems)
                .values({
                  organizationId,
                  projectId,
                  queueId,
                  traceId,
                  traceCreatedAt,
                  completedAt: null,
                  completedBy: null,
                  reviewStartedAt: null,
                })
                .onConflictDoNothing({
                  target: [
                    annotationQueueItems.organizationId,
                    annotationQueueItems.projectId,
                    annotationQueueItems.queueId,
                    annotationQueueItems.traceId,
                  ],
                })
                .returning({ id: annotationQueueItems.id }),
            )
            .pipe(
              Effect.map((result) => result.length > 0),
              Effect.mapError((cause) => new RepositoryError({ operation: "insertIfNotExists", cause })),
            )
        }),

      bulkInsertIfNotExists: ({ projectId, queueId, items }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          if (items.length === 0) {
            return { insertedCount: 0 }
          }

          const result = yield* sqlClient.query((db, organizationId) =>
            db
              .insert(annotationQueueItems)
              .values(
                items.map((item) => ({
                  organizationId,
                  projectId,
                  queueId,
                  traceId: item.traceId,
                  traceCreatedAt: item.traceCreatedAt,
                  completedAt: null,
                  completedBy: null,
                  reviewStartedAt: null,
                })),
              )
              .onConflictDoNothing({
                target: [
                  annotationQueueItems.organizationId,
                  annotationQueueItems.projectId,
                  annotationQueueItems.queueId,
                  annotationQueueItems.traceId,
                ],
              })
              .returning({ id: annotationQueueItems.id }),
          )

          return { insertedCount: result.length }
        }).pipe(Effect.mapError((cause) => new RepositoryError({ operation: "bulkInsertIfNotExists", cause }))),

      insertManyAcrossQueues: ({ projectId, traceId, traceCreatedAt, queueIds }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          if (queueIds.length === 0) {
            return { insertedQueueIds: [] as readonly string[] }
          }

          const result = yield* sqlClient.query((db, organizationId) =>
            db
              .insert(annotationQueueItems)
              .values(
                queueIds.map((queueId) => ({
                  organizationId,
                  projectId,
                  queueId,
                  traceId,
                  traceCreatedAt,
                  completedAt: null,
                  completedBy: null,
                  reviewStartedAt: null,
                })),
              )
              .onConflictDoNothing({
                target: [
                  annotationQueueItems.organizationId,
                  annotationQueueItems.projectId,
                  annotationQueueItems.queueId,
                  annotationQueueItems.traceId,
                ],
              })
              .returning({ queueId: annotationQueueItems.queueId }),
          )

          return { insertedQueueIds: result.map((r) => r.queueId) }
        }).pipe(Effect.mapError((cause) => new RepositoryError({ operation: "insertManyAcrossQueues", cause }))),

      listByTraceId: ({ projectId, traceId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(annotationQueueItems)
                .where(
                  and(
                    eq(annotationQueueItems.organizationId, organizationId),
                    eq(annotationQueueItems.projectId, projectId),
                    eq(annotationQueueItems.traceId, traceId),
                  ),
                ),
            )
            .pipe(
              Effect.map((rows) => rows.map(toDomainItem)),
              Effect.mapError((cause) => new RepositoryError({ operation: "listByTraceId", cause })),
            )
        }),

      getAdjacentItems: ({ projectId, queueId, currentItemId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) => {
              const orderClauseSql = sql`${statusRankSql} ASC, ${annotationQueueItems.traceCreatedAt} DESC, ${annotationQueueItems.id} DESC`

              return db.execute<{ prev_id: string | null; next_id: string | null }>(sql`
                WITH ranked AS (
                  SELECT
                    ${annotationQueueItems.id} AS id,
                    LAG(${annotationQueueItems.id}) OVER (ORDER BY ${orderClauseSql}) AS prev_id,
                    LEAD(${annotationQueueItems.id}) OVER (ORDER BY ${orderClauseSql}) AS next_id
                  FROM ${annotationQueueItems}
                  WHERE ${annotationQueueItems.organizationId} = ${organizationId}
                    AND ${annotationQueueItems.projectId} = ${projectId}
                    AND ${annotationQueueItems.queueId} = ${queueId}
                )
                SELECT prev_id, next_id FROM ranked WHERE id = ${currentItemId}
              `)
            })
            .pipe(
              Effect.map((result) => {
                const row = result.rows[0]
                return {
                  previousItemId: row?.prev_id ?? null,
                  nextItemId: row?.next_id ?? null,
                }
              }),
              Effect.mapError((cause) => new RepositoryError({ operation: "getAdjacentItems", cause })),
            )
        }),

      getQueuePosition: ({ projectId, queueId, currentItemId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) => {
              const orderClauseSql = sql`${statusRankSql} ASC, ${annotationQueueItems.traceCreatedAt} DESC, ${annotationQueueItems.id} DESC`

              return db.execute<{ row_num: number | null; total: number }>(sql`
                WITH ranked AS (
                  SELECT
                    ${annotationQueueItems.id} AS id,
                    ROW_NUMBER() OVER (ORDER BY ${orderClauseSql}) AS row_num,
                    COUNT(*) OVER () AS total
                  FROM ${annotationQueueItems}
                  WHERE ${annotationQueueItems.organizationId} = ${organizationId}
                    AND ${annotationQueueItems.projectId} = ${projectId}
                    AND ${annotationQueueItems.queueId} = ${queueId}
                )
                SELECT
                  (SELECT row_num FROM ranked WHERE id = ${currentItemId}) AS row_num,
                  COALESCE((SELECT total FROM ranked LIMIT 1), 0) AS total
              `)
            })
            .pipe(
              Effect.map((result) => {
                const row = result.rows[0]
                return {
                  currentIndex: row?.row_num ?? 0,
                  totalItems: row?.total ?? 0,
                }
              }),
              Effect.mapError((cause) => new RepositoryError({ operation: "getQueuePosition", cause })),
            )
        }),

      update: ({ projectId, queueId, itemId, completedAt, completedBy, reviewStartedAt }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(annotationQueueItems)
                .set({
                  ...(completedAt !== undefined && { completedAt }),
                  ...(completedBy !== undefined && { completedBy }),
                  ...(reviewStartedAt !== undefined && { reviewStartedAt }),
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(annotationQueueItems.organizationId, organizationId),
                    eq(annotationQueueItems.projectId, projectId),
                    eq(annotationQueueItems.queueId, queueId),
                    eq(annotationQueueItems.id, itemId),
                  ),
                )
                .returning(),
            )
            .pipe(
              Effect.flatMap((rows) => {
                const updated = rows[0]
                if (!updated) {
                  return Effect.fail(
                    new NotFoundError({
                      entity: "AnnotationQueueItem",
                      id: itemId,
                    }),
                  )
                }
                return Effect.succeed(toDomainItem(updated))
              }),
              Effect.mapError((cause) => {
                if (cause instanceof NotFoundError) return cause
                return new RepositoryError({ operation: "update", cause })
              }),
            )
        }),

      getNextUncompletedItem: ({ projectId, queueId, currentItemId: _currentItemId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select({ id: annotationQueueItems.id })
                .from(annotationQueueItems)
                .where(
                  and(
                    eq(annotationQueueItems.organizationId, organizationId),
                    eq(annotationQueueItems.projectId, projectId),
                    eq(annotationQueueItems.queueId, queueId),
                    sql`${annotationQueueItems.completedAt} IS NULL`,
                  ),
                )
                .orderBy(desc(annotationQueueItems.traceCreatedAt), desc(annotationQueueItems.id))
                .limit(1),
            )
            .pipe(
              Effect.map((rows) => rows[0]?.id ?? null),
              Effect.mapError(
                (cause) =>
                  new RepositoryError({
                    operation: "getNextUncompletedItem",
                    cause,
                  }),
              ),
            )
        }),
    } satisfies AnnotationQueueItemRepositoryShape
  }),
)
