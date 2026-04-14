import {
  type AnnotationQueueItemListCursor,
  type AnnotationQueueItemListOptions,
  type AnnotationQueueItemListSortBy,
  AnnotationQueueItemRepository,
  completeQueueItemUseCase,
  requestBulkQueueItems,
  type TraceSelection,
  uncompleteQueueItemUseCase,
} from "@domain/annotation-queues"
import { AnnotationQueueId, filterSetSchema, OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { ChSqlClientLive, TraceRepositoryLive } from "@platform/db-clickhouse"
import {
  AnnotationQueueItemRepositoryLive,
  AnnotationQueueRepositoryLive,
  OutboxEventWriterLive,
  SqlClientLive,
} from "@platform/db-postgres"
import { QueuePublisherLive } from "@platform/queue-bullmq"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getClickhouseClient, getPostgresClient, getQueuePublisher } from "../../server/clients.ts"

const itemListCursorSchema = z.object({
  sortValue: z.string(),
  id: z.string(),
  statusRank: z.number().int().min(0).max(2).optional(),
})

const itemListSortBySchema = z.enum(["createdAt", "status"])

interface AnnotationQueueItemListResult {
  readonly items: readonly AnnotationQueueItemRecord[]
  readonly hasMore: boolean
  readonly nextCursor?: AnnotationQueueItemListCursor
}

const toItemRecord = (row: {
  id: string
  organizationId: string
  projectId: string
  queueId: string
  traceId: string
  traceCreatedAt: Date
  completedAt: Date | null
  completedBy: string | null
  reviewStartedAt: Date | null
  createdAt: Date
  updatedAt: Date
}) => ({
  id: row.id,
  organizationId: row.organizationId,
  projectId: row.projectId,
  queueId: row.queueId,
  traceId: row.traceId,
  traceCreatedAt: row.traceCreatedAt.toISOString(),
  completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  completedBy: row.completedBy,
  reviewStartedAt: row.reviewStartedAt ? row.reviewStartedAt.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

export type AnnotationQueueItemRecord = ReturnType<typeof toItemRecord> & {
  traceDisplayName: string
}

export const listAnnotationQueueItemsByQueue = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      queueId: z.string(),
      limit: z.number().optional(),
      cursor: itemListCursorSchema.optional(),
      sortBy: itemListSortBySchema.optional(),
      sortDirection: z.enum(["asc", "desc"]).optional(),
    }),
  )
  .handler(async ({ data }): Promise<AnnotationQueueItemListResult> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const pg = getPostgresClient()
    const ch = getClickhouseClient()

    const sortBy: AnnotationQueueItemListSortBy | undefined = data.sortBy
    const sortDirection = data.sortDirection

    const itemsLayer = Layer.mergeAll(AnnotationQueueItemRepositoryLive, TraceRepositoryLive).pipe(
      Layer.provideMerge(SqlClientLive(pg, orgId)),
      Layer.provideMerge(ChSqlClientLive(ch, orgId)),
    )

    const page = await Effect.runPromise(
      Effect.gen(function* () {
        const itemRepo = yield* AnnotationQueueItemRepository
        const traceRepo = yield* TraceRepository

        const c = data.cursor
        const listOptions: AnnotationQueueItemListOptions = {
          limit: data.limit ?? 50,
          ...(sortBy !== undefined ? { sortBy } : {}),
          ...(sortDirection !== undefined ? { sortDirection } : {}),
          ...(c
            ? c.statusRank !== undefined
              ? { cursor: { sortValue: c.sortValue, id: c.id, statusRank: c.statusRank } }
              : { cursor: { sortValue: c.sortValue, id: c.id } }
            : {}),
        }

        const listPage = yield* itemRepo.listByQueue({
          projectId,
          queueId: data.queueId,
          options: listOptions,
        })

        const uniqueIds = [...new Set(listPage.items.map((i) => i.traceId as string))]
        const traceIds = uniqueIds.map((id) => TraceId(id))

        const traces =
          traceIds.length === 0
            ? []
            : yield* traceRepo.listByTraceIds({
                organizationId: orgId,
                projectId,
                traceIds,
              })

        const nameByTrace = new Map<string, string>(
          traces.map((t) => {
            const id = t.traceId as string
            const short = id.slice(0, 8)
            const label = t.rootSpanName?.trim() ? t.rootSpanName : short
            return [id, label] as const
          }),
        )

        const items: AnnotationQueueItemRecord[] = listPage.items.map((item) => {
          const base = toItemRecord(item)
          const tid = item.traceId as string
          return {
            ...base,
            traceDisplayName: nameByTrace.get(tid) ?? tid.slice(0, 8),
          }
        })

        if (!listPage.nextCursor) {
          return { items, hasMore: listPage.hasMore }
        }
        return {
          items,
          hasMore: listPage.hasMore,
          nextCursor: listPage.nextCursor,
        }
      }).pipe(Effect.provide(itemsLayer)),
    )

    return page
  })

const bulkSelectionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("selected"), rowIds: z.array(z.string()).min(1) }),
  z.object({ mode: z.literal("all"), filters: filterSetSchema.optional() }),
  z.object({ mode: z.literal("allExcept"), rowIds: z.array(z.string()), filters: filterSetSchema.optional() }),
])

function toTraceSelection(sel: z.infer<typeof bulkSelectionSchema>): TraceSelection {
  if (sel.mode === "all") {
    return { mode: "all", ...(sel.filters ? { filters: sel.filters } : {}) }
  }
  if (sel.mode === "allExcept") {
    return { mode: sel.mode, traceIds: sel.rowIds.map(TraceId), ...(sel.filters ? { filters: sel.filters } : {}) }
  }
  return { mode: sel.mode, traceIds: sel.rowIds.map(TraceId) }
}

const addTracesToQueueInputSchema = z
  .object({
    projectId: z.string(),
    queueId: z.string().optional(),
    newQueueName: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().min(1, "Queue name cannot be empty"))
      .optional(),
    selection: bulkSelectionSchema,
  })
  .refine((data) => Boolean(data.queueId) !== Boolean(data.newQueueName), {
    message: "Provide either queueId or newQueueName, but not both",
  })

export const addTracesToQueueFunction = createServerFn({ method: "POST" })
  .inputValidator(addTracesToQueueInputSchema)
  .handler(async ({ data }): Promise<{ queueId: string }> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const pg = getPostgresClient()
    const ch = getClickhouseClient()
    const publisher = await getQueuePublisher()

    const layer = Layer.mergeAll(AnnotationQueueRepositoryLive, QueuePublisherLive(publisher)).pipe(
      Layer.provideMerge(SqlClientLive(pg, orgId)),
      Layer.provideMerge(ChSqlClientLive(ch, orgId)),
    )

    const selection = toTraceSelection(data.selection)

    const input = data.queueId
      ? { projectId, queueId: AnnotationQueueId(data.queueId), selection }
      : { projectId, newQueueName: data.newQueueName as string, selection }

    const result = await Effect.runPromise(requestBulkQueueItems(input).pipe(Effect.provide(layer)))
    return { queueId: result.queueId as string }
  })

export const getAnnotationQueueItemDetail = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      queueId: z.string(),
      itemId: z.string(),
    }),
  )
  .handler(async ({ data }): Promise<AnnotationQueueItemRecord | null> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const pg = getPostgresClient()
    const ch = getClickhouseClient()

    const layer = Layer.mergeAll(AnnotationQueueItemRepositoryLive, TraceRepositoryLive).pipe(
      Layer.provideMerge(SqlClientLive(pg, orgId)),
      Layer.provideMerge(ChSqlClientLive(ch, orgId)),
    )

    return await Effect.runPromise(
      Effect.gen(function* () {
        const itemRepo = yield* AnnotationQueueItemRepository
        const traceRepo = yield* TraceRepository

        const item = yield* itemRepo.findById({
          projectId,
          queueId: data.queueId,
          itemId: data.itemId,
        })

        if (!item) return null

        const traces = yield* traceRepo.listByTraceIds({
          organizationId: orgId,
          projectId,
          traceIds: [TraceId(item.traceId as string)],
        })

        const trace = traces[0]
        const tid = item.traceId as string
        const traceDisplayName = trace?.rootSpanName?.trim() ? trace.rootSpanName : tid.slice(0, 8)

        return {
          ...toItemRecord(item),
          traceDisplayName,
        }
      }).pipe(Effect.provide(layer)),
    )
  })

interface QueueItemNavigationResult {
  readonly previousItemId: string | null
  readonly nextItemId: string | null
  readonly currentIndex: number
  readonly totalItems: number
}

export const getQueueItemNavigation = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      queueId: z.string(),
      itemId: z.string(),
    }),
  )
  .handler(async ({ data }): Promise<QueueItemNavigationResult> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const pg = getPostgresClient()

    const layer = AnnotationQueueItemRepositoryLive.pipe(Layer.provideMerge(SqlClientLive(pg, orgId)))

    return Effect.runPromise(
      Effect.gen(function* () {
        const itemRepo = yield* AnnotationQueueItemRepository

        const [adjacent, position] = yield* Effect.all([
          itemRepo.getAdjacentItems({
            projectId,
            queueId: data.queueId,
            currentItemId: data.itemId,
          }),
          itemRepo.getQueuePosition({
            projectId,
            queueId: data.queueId,
            currentItemId: data.itemId,
          }),
        ])

        return {
          previousItemId: adjacent.previousItemId,
          nextItemId: adjacent.nextItemId,
          currentIndex: position.currentIndex,
          totalItems: position.totalItems,
        }
      }).pipe(Effect.provide(layer)),
    )
  })

export const completeQueueItem = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      queueId: z.string(),
      itemId: z.string(),
    }),
  )
  .handler(async ({ data }): Promise<{ nextItemId: string | null }> => {
    const { organizationId, userId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const pg = getPostgresClient()

    const layer = Layer.mergeAll(
      AnnotationQueueItemRepositoryLive,
      AnnotationQueueRepositoryLive,
      OutboxEventWriterLive,
    ).pipe(Layer.provideMerge(SqlClientLive(pg, orgId)))

    return Effect.runPromise(
      Effect.gen(function* () {
        const itemRepo = yield* AnnotationQueueItemRepository

        yield* completeQueueItemUseCase({
          projectId,
          queueId: data.queueId,
          itemId: data.itemId,
          userId,
        })

        const nextItemId = yield* itemRepo.getNextUncompletedItem({
          projectId,
          queueId: data.queueId,
          currentItemId: data.itemId,
        })

        return { nextItemId }
      }).pipe(Effect.provide(layer)),
    )
  })

export const uncompleteQueueItem = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      queueId: z.string(),
      itemId: z.string(),
    }),
  )
  .handler(async ({ data }): Promise<void> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const pg = getPostgresClient()

    const layer = Layer.mergeAll(AnnotationQueueItemRepositoryLive, AnnotationQueueRepositoryLive).pipe(
      Layer.provideMerge(SqlClientLive(pg, orgId)),
    )

    await Effect.runPromise(
      uncompleteQueueItemUseCase({
        projectId,
        queueId: data.queueId,
        itemId: data.itemId,
      }).pipe(Effect.provide(layer)),
    )
  })
