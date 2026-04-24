import {
  type AnnotationQueue,
  type AnnotationQueueListSortBy,
  AnnotationQueueRepository,
  type AnnotationQueueRepositoryShape,
  annotationQueueSchema,
  evictProjectSystemQueuesUseCase,
} from "@domain/annotation-queues"
import { ProjectId, RepositoryError, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { annotationQueues } from "../schema/annotation-queues.ts"

const DEFAULT_LIMIT = 50

const pendingItemsExpr = sql<number>`(${annotationQueues.totalItems} - ${annotationQueues.completedItems})`

const toDomainQueue = (row: typeof annotationQueues.$inferSelect): AnnotationQueue =>
  annotationQueueSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    system: row.system,
    name: row.name,
    slug: row.slug,
    description: row.description,
    instructions: row.instructions,
    settings: row.settings,
    assignees: row.assignees,
    totalItems: row.totalItems,
    completedItems: row.completedItems,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const resolveSort = (
  sortBy: AnnotationQueueListSortBy | undefined,
  sortDirection: "asc" | "desc" | undefined,
): { sortBy: AnnotationQueueListSortBy; sortDirection: "asc" | "desc" } => ({
  sortBy: sortBy ?? "createdAt",
  sortDirection: sortDirection ?? "desc",
})

const cursorWhere = (
  sortBy: AnnotationQueueListSortBy,
  sortDirection: "asc" | "desc",
  cursor: { sortValue: string; id: string },
) => {
  if (sortBy === "createdAt") {
    const createdAt = new Date(cursor.sortValue)
    if (Number.isNaN(createdAt.getTime())) {
      return null
    }
    if (sortDirection === "desc") {
      return or(
        lt(annotationQueues.createdAt, createdAt),
        and(eq(annotationQueues.createdAt, createdAt), lt(annotationQueues.id, cursor.id)),
      )
    }
    return or(
      gt(annotationQueues.createdAt, createdAt),
      and(eq(annotationQueues.createdAt, createdAt), gt(annotationQueues.id, cursor.id)),
    )
  }

  if (sortBy === "name") {
    if (sortDirection === "desc") {
      return or(
        lt(annotationQueues.name, cursor.sortValue),
        and(eq(annotationQueues.name, cursor.sortValue), lt(annotationQueues.id, cursor.id)),
      )
    }
    return or(
      gt(annotationQueues.name, cursor.sortValue),
      and(eq(annotationQueues.name, cursor.sortValue), gt(annotationQueues.id, cursor.id)),
    )
  }

  const n = Number.parseInt(cursor.sortValue, 10)
  if (!Number.isFinite(n)) {
    return null
  }

  if (sortBy === "completedItems") {
    if (sortDirection === "desc") {
      return or(
        lt(annotationQueues.completedItems, n),
        and(eq(annotationQueues.completedItems, n), lt(annotationQueues.id, cursor.id)),
      )
    }
    return or(
      gt(annotationQueues.completedItems, n),
      and(eq(annotationQueues.completedItems, n), gt(annotationQueues.id, cursor.id)),
    )
  }

  if (sortDirection === "desc") {
    return or(
      sql`${pendingItemsExpr} < ${n}`,
      sql`(${pendingItemsExpr} = ${n} AND ${annotationQueues.id} < ${cursor.id})`,
    )
  }
  return or(
    sql`${pendingItemsExpr} > ${n}`,
    sql`(${pendingItemsExpr} = ${n} AND ${annotationQueues.id} > ${cursor.id})`,
  )
}

const orderClause = (sortBy: AnnotationQueueListSortBy, sortDirection: "asc" | "desc") => {
  const primary = sortDirection === "desc" ? desc : asc
  const idOrd = sortDirection === "desc" ? desc(annotationQueues.id) : asc(annotationQueues.id)
  if (sortBy === "createdAt") {
    return [primary(annotationQueues.createdAt), idOrd] as const
  }
  if (sortBy === "name") {
    return [primary(annotationQueues.name), idOrd] as const
  }
  if (sortBy === "completedItems") {
    return [primary(annotationQueues.completedItems), idOrd] as const
  }
  return [primary(pendingItemsExpr), idOrd] as const
}

const tailToCursor = (sortBy: AnnotationQueueListSortBy, tail: typeof annotationQueues.$inferSelect) => {
  if (sortBy === "createdAt") {
    return { sortValue: tail.createdAt.toISOString(), id: tail.id } as const
  }
  if (sortBy === "name") {
    return { sortValue: tail.name, id: tail.id } as const
  }
  if (sortBy === "completedItems") {
    return { sortValue: String(tail.completedItems), id: tail.id } as const
  }
  return {
    sortValue: String(Math.max(0, tail.totalItems - tail.completedItems)),
    id: tail.id,
  } as const
}

const evictSystemQueueCache = (queue: Pick<AnnotationQueue, "organizationId" | "projectId">) =>
  evictProjectSystemQueuesUseCase({
    organizationId: queue.organizationId,
    projectId: ProjectId(queue.projectId),
  })

export const AnnotationQueueRepositoryLive = Layer.effect(
  AnnotationQueueRepository,
  Effect.gen(function* () {
    return {
      listByProject: ({ projectId, options }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const limit = options.limit ?? DEFAULT_LIMIT
          const { sortBy, sortDirection } = resolveSort(options.sortBy, options.sortDirection)
          const cursorClause = options.cursor ? cursorWhere(sortBy, sortDirection, options.cursor) : undefined
          if (options.cursor && cursorClause === null) {
            return yield* new RepositoryError({
              operation: "listByProject",
              cause: new Error("Invalid queue list cursor"),
            })
          }

          const [o1, o2] = orderClause(sortBy, sortDirection)

          return yield* sqlClient
            .query((db, organizationId) => {
              const whereBase = and(
                eq(annotationQueues.organizationId, organizationId),
                eq(annotationQueues.projectId, projectId),
                isNull(annotationQueues.deletedAt),
              )
              const where = cursorClause ? and(whereBase, cursorClause) : whereBase

              return db
                .select()
                .from(annotationQueues)
                .where(where)
                .orderBy(o1, o2)
                .limit(limit + 1)
            })
            .pipe(
              Effect.map((rows) => {
                const hasMore = rows.length > limit
                const pageRows = rows.slice(0, limit)
                const items = pageRows.map(toDomainQueue)
                const tail = pageRows[pageRows.length - 1]
                const nextCursor =
                  hasMore && tail !== undefined
                    ? (tailToCursor(sortBy, tail) as {
                        sortValue: string
                        id: string
                      })
                    : undefined
                return {
                  items,
                  hasMore,
                  ...(nextCursor !== undefined ? { nextCursor } : {}),
                }
              }),
              Effect.mapError((cause) => new RepositoryError({ operation: "listByProject", cause })),
            )
        }),

      findByIdInProject: ({ projectId, queueId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(annotationQueues)
                .where(
                  and(
                    eq(annotationQueues.organizationId, organizationId),
                    eq(annotationQueues.projectId, projectId),
                    eq(annotationQueues.id, queueId),
                    isNull(annotationQueues.deletedAt),
                  ),
                )
                .limit(1),
            )
            .pipe(
              Effect.map((rows) => {
                const row = rows[0]
                return row !== undefined ? toDomainQueue(row) : null
              }),
              Effect.mapError((cause) => new RepositoryError({ operation: "findByIdInProject", cause })),
            )
        }),

      findBySlugInProject: ({ projectId, queueSlug }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(annotationQueues)
                .where(
                  and(
                    eq(annotationQueues.organizationId, organizationId),
                    eq(annotationQueues.projectId, projectId),
                    eq(annotationQueues.slug, queueSlug),
                    isNull(annotationQueues.deletedAt),
                  ),
                )
                .limit(1),
            )
            .pipe(
              Effect.map((rows) => {
                const row = rows[0]
                return row !== undefined ? toDomainQueue(row) : null
              }),
              Effect.mapError(
                (cause) =>
                  new RepositoryError({
                    operation: "findBySlugInProject",
                    cause,
                  }),
              ),
            )
        }),

      listSystemQueuesByProject: ({ projectId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(annotationQueues)
                .where(
                  and(
                    eq(annotationQueues.organizationId, organizationId),
                    eq(annotationQueues.projectId, projectId),
                    eq(annotationQueues.system, true),
                    isNull(annotationQueues.deletedAt),
                  ),
                )
                .orderBy(annotationQueues.createdAt),
            )
            .pipe(
              Effect.map((rows) => rows.map(toDomainQueue)),
              Effect.mapError(
                (cause) =>
                  new RepositoryError({
                    operation: "listSystemQueuesByProject",
                    cause,
                  }),
              ),
            )
        }),

      listLiveQueuesByProject: ({ projectId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(annotationQueues)
                .where(
                  and(
                    eq(annotationQueues.organizationId, organizationId),
                    eq(annotationQueues.projectId, projectId),
                    isNull(annotationQueues.deletedAt),
                    sql`${annotationQueues.settings}->'filter' IS NOT NULL`,
                  ),
                )
                .orderBy(annotationQueues.createdAt),
            )
            .pipe(
              Effect.map((rows) => rows.map(toDomainQueue)),
              Effect.mapError(
                (cause) =>
                  new RepositoryError({
                    operation: "listLiveQueuesByProject",
                    cause,
                  }),
              ),
            )
        }),

      findSystemQueueBySlugInProject: ({ projectId, queueSlug }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(annotationQueues)
                .where(
                  and(
                    eq(annotationQueues.organizationId, organizationId),
                    eq(annotationQueues.projectId, projectId),
                    eq(annotationQueues.system, true),
                    eq(annotationQueues.slug, queueSlug),
                  ),
                )
                .limit(1),
            )
            .pipe(
              Effect.map((rows) => {
                const row = rows[0]
                return row !== undefined ? toDomainQueue(row) : null
              }),
              Effect.mapError(
                (cause) =>
                  new RepositoryError({
                    operation: "findSystemQueueBySlugInProject",
                    cause,
                  }),
              ),
            )
        }),

      save: (queue) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .insert(annotationQueues)
                .values({
                  ...(queue.id !== undefined ? { id: queue.id } : {}),
                  organizationId,
                  projectId: queue.projectId,
                  system: queue.system,
                  name: queue.name,
                  slug: queue.slug,
                  description: queue.description,
                  instructions: queue.instructions,
                  settings: queue.settings,
                  assignees: queue.assignees,
                  totalItems: queue.totalItems,
                  completedItems: queue.completedItems,
                  deletedAt: queue.deletedAt,
                  createdAt: queue.createdAt,
                  updatedAt: queue.updatedAt,
                })
                .onConflictDoUpdate({
                  target: annotationQueues.id,
                  set: {
                    name: queue.name,
                    slug: queue.slug,
                    description: queue.description,
                    instructions: queue.instructions,
                    settings: queue.settings,
                    assignees: queue.assignees,
                    totalItems: queue.totalItems,
                    completedItems: queue.completedItems,
                    deletedAt: queue.deletedAt,
                    updatedAt: queue.updatedAt,
                  },
                })
                .returning(),
            )
            .pipe(
              Effect.map((rows) => toDomainQueue(rows[0])),
              Effect.mapError((cause) => new RepositoryError({ operation: "save", cause })),
              Effect.tap((saved) => evictSystemQueueCache(saved)),
            )
        }),

      insertIfNotExists: (queue) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .insert(annotationQueues)
                .values({
                  id: queue.id,
                  organizationId,
                  projectId: queue.projectId,
                  system: queue.system,
                  name: queue.name,
                  slug: queue.slug,
                  description: queue.description,
                  instructions: queue.instructions,
                  settings: queue.settings,
                  assignees: queue.assignees,
                  totalItems: queue.totalItems,
                  completedItems: queue.completedItems,
                  deletedAt: queue.deletedAt,
                  createdAt: queue.createdAt,
                  updatedAt: queue.updatedAt,
                })
                .onConflictDoNothing({
                  target: [
                    annotationQueues.organizationId,
                    annotationQueues.projectId,
                    annotationQueues.slug,
                    annotationQueues.deletedAt,
                  ],
                })
                .returning({ id: annotationQueues.id }),
            )
            .pipe(
              Effect.map((result) => result.length > 0),
              Effect.mapError((cause) => new RepositoryError({ operation: "insertIfNotExists", cause })),
              Effect.tap((wasInserted) => (wasInserted ? evictSystemQueueCache(queue) : Effect.void)),
            )
        }),

      incrementTotalItems: ({ projectId, queueId, delta = 1 }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(annotationQueues)
                .set({
                  totalItems: sql`${annotationQueues.totalItems} + ${delta}`,
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(annotationQueues.organizationId, organizationId),
                    eq(annotationQueues.projectId, projectId),
                    eq(annotationQueues.id, queueId),
                    isNull(annotationQueues.deletedAt),
                  ),
                )
                .returning(),
            )
            .pipe(
              Effect.flatMap((rows) => {
                const row = rows[0]
                if (row === undefined) {
                  return Effect.fail(
                    new RepositoryError({
                      operation: "incrementTotalItems",
                      cause: new Error(`Queue not found: ${queueId}`),
                    }),
                  )
                }
                return Effect.succeed(toDomainQueue(row))
              }),
              Effect.mapError((cause) =>
                cause instanceof RepositoryError
                  ? cause
                  : new RepositoryError({
                      operation: "incrementTotalItems",
                      cause,
                    }),
              ),
              Effect.tap((queue) => evictSystemQueueCache(queue)),
            )
        }),

      incrementTotalItemsMany: ({ projectId, queueIds }) =>
        Effect.gen(function* () {
          if (queueIds.length === 0) {
            return
          }
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(annotationQueues)
                .set({
                  totalItems: sql`${annotationQueues.totalItems} + 1`,
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(annotationQueues.organizationId, organizationId),
                    eq(annotationQueues.projectId, projectId),
                    inArray(annotationQueues.id, [...queueIds]),
                    isNull(annotationQueues.deletedAt),
                  ),
                ),
            )
            .pipe(
              Effect.asVoid,
              Effect.mapError(
                (cause) =>
                  new RepositoryError({
                    operation: "incrementTotalItemsMany",
                    cause,
                  }),
              ),
            )
        }),

      incrementCompletedItems: ({ projectId, queueId, delta }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(annotationQueues)
                .set({
                  completedItems: sql`GREATEST(0, ${annotationQueues.completedItems} + ${delta})`,
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(annotationQueues.organizationId, organizationId),
                    eq(annotationQueues.projectId, projectId),
                    eq(annotationQueues.id, queueId),
                  ),
                ),
            )
            .pipe(
              Effect.asVoid,
              Effect.mapError(
                (cause) =>
                  new RepositoryError({
                    operation: "incrementCompletedItems",
                    cause,
                  }),
              ),
            )
        }),
    } satisfies AnnotationQueueRepositoryShape
  }),
)
