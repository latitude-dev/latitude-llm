import {
  type AnnotationQueueItem,
  type AnnotationQueueItemListSortBy,
  AnnotationQueueItemRepository,
  type AnnotationQueueItemRepositoryShape,
  annotationQueueItemSchema,
  annotationQueueItemStatusRankFromTimestamps,
} from "@domain/annotation-queues"
import { RepositoryError, SqlClient, type SqlClientShape, TraceId } from "@domain/shared"
import { createId } from "@paralleldrive/cuid2"
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
    completedAt: row.completedAt,
    completedBy: row.completedBy,
    reviewStartedAt: row.reviewStartedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const resolveSort = (
  sortBy: AnnotationQueueItemListSortBy | undefined,
  sortDirection: "asc" | "desc" | undefined,
): { sortBy: AnnotationQueueItemListSortBy; sortDirection: "asc" | "desc" } => ({
  sortBy: sortBy ?? "status",
  sortDirection: sortDirection ?? "asc",
})

const cursorWhereCreatedAt = (sortDirection: "asc" | "desc", cursor: { sortValue: string; id: string }) => {
  const createdAt = new Date(cursor.sortValue)
  if (Number.isNaN(createdAt.getTime())) {
    return null
  }
  if (sortDirection === "desc") {
    return or(
      lt(annotationQueueItems.createdAt, createdAt),
      and(eq(annotationQueueItems.createdAt, createdAt), lt(annotationQueueItems.id, cursor.id)),
    )
  }
  return or(
    gt(annotationQueueItems.createdAt, createdAt),
    and(eq(annotationQueueItems.createdAt, createdAt), gt(annotationQueueItems.id, cursor.id)),
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
  const createdAt = new Date(cursor.sortValue)
  if (Number.isNaN(createdAt.getTime())) {
    return null
  }

  if (sortDirection === "asc") {
    return or(
      gt(statusRankSql, cr),
      and(eq(statusRankSql, cr), lt(annotationQueueItems.createdAt, createdAt)),
      and(eq(statusRankSql, cr), eq(annotationQueueItems.createdAt, createdAt), lt(annotationQueueItems.id, cursor.id)),
    )
  }
  return or(
    lt(statusRankSql, cr),
    and(eq(statusRankSql, cr), lt(annotationQueueItems.createdAt, createdAt)),
    and(eq(statusRankSql, cr), eq(annotationQueueItems.createdAt, createdAt), lt(annotationQueueItems.id, cursor.id)),
  )
}

const orderClause = (sortBy: AnnotationQueueItemListSortBy, sortDirection: "asc" | "desc") => {
  if (sortBy === "createdAt") {
    const primary = sortDirection === "desc" ? desc : asc
    const idOrd = sortDirection === "desc" ? desc(annotationQueueItems.id) : asc(annotationQueueItems.id)
    return [primary(annotationQueueItems.createdAt), idOrd] as const
  }

  const rankOrd = sortDirection === "asc" ? asc(statusRankSql) : desc(statusRankSql)
  return [rankOrd, desc(annotationQueueItems.createdAt), desc(annotationQueueItems.id)] as const
}

const tailToCursor = (sortBy: AnnotationQueueItemListSortBy, tail: typeof annotationQueueItems.$inferSelect) => {
  const base = {
    sortValue: tail.createdAt.toISOString(),
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
    return cursorWhereCreatedAt(sortDirection, cursor)
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
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      findById: ({ projectId, queueId, itemId }) =>
        sqlClient
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
          ),

      listByQueue: ({ projectId, queueId, options }) => {
        const limit = options.limit ?? DEFAULT_LIMIT
        const { sortBy, sortDirection } = resolveSort(options.sortBy, options.sortDirection)
        const cursorClause = options.cursor ? cursorWhere(sortBy, sortDirection, options.cursor) : undefined
        if (options.cursor && cursorClause === null) {
          return Effect.fail(
            new RepositoryError({ operation: "listByQueue", cause: new Error("Invalid item list cursor") }),
          )
        }

        const orders = orderClause(sortBy, sortDirection)

        return sqlClient
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
      },

      insertIfNotExists: ({ projectId, queueId, traceId }) =>
        sqlClient
          .query((db, organizationId) =>
            db
              .insert(annotationQueueItems)
              .values({
                id: createId(),
                organizationId,
                projectId,
                queueId,
                traceId,
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
          ),
    } satisfies AnnotationQueueItemRepositoryShape
  }),
)
