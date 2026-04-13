import { AnnotationQueueId, AnnotationQueueItemId, generateId, NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import type { AnnotationQueueItem } from "../entities/annotation-queue-items.ts"
import type { AnnotationQueueItemRepositoryShape } from "../ports/annotation-queue-item-repository.ts"

export const createFakeAnnotationQueueItemRepository = (
  seedOrOverrides?: readonly AnnotationQueueItem[] | Partial<AnnotationQueueItemRepositoryShape>,
  maybeOverrides?: Partial<AnnotationQueueItemRepositoryShape>,
) => {
  const seed = Array.isArray(seedOrOverrides) ? seedOrOverrides : []
  const overrides = Array.isArray(seedOrOverrides) ? maybeOverrides : seedOrOverrides

  const items = new Map<string, AnnotationQueueItem>(seed.map((item) => [item.id, item] as const))

  const repository: AnnotationQueueItemRepositoryShape = {
    insertIfNotExists: ({ projectId, queueId, traceId, traceCreatedAt }) =>
      Effect.sync(() => {
        const exists = [...items.values()].some(
          (i) => i.projectId === projectId && i.queueId === queueId && i.traceId === traceId,
        )
        if (exists) return false

        const now = new Date()
        const newItem: AnnotationQueueItem = {
          id: AnnotationQueueItemId(generateId()),
          organizationId: "",
          projectId,
          queueId: AnnotationQueueId(queueId),
          traceId,
          traceCreatedAt,
          completedAt: null,
          completedBy: null,
          reviewStartedAt: null,
          createdAt: now,
          updatedAt: now,
        }
        items.set(newItem.id, newItem)
        return true
      }),

    listByQueue: ({ projectId, queueId, options }) =>
      Effect.sync(() => {
        const filtered = [...items.values()].filter((i) => i.projectId === projectId && i.queueId === queueId)
        const limit = options?.limit ?? 50
        return {
          items: filtered.slice(0, limit),
          hasMore: filtered.length > limit,
        }
      }),

    listByTraceId: ({ projectId, traceId }) =>
      Effect.sync(() => [...items.values()].filter((i) => i.projectId === projectId && i.traceId === traceId)),

    findById: ({ projectId, queueId, itemId }) =>
      Effect.sync(() => {
        const item = items.get(itemId)
        if (!item || item.projectId !== projectId || item.queueId !== queueId) return null
        return item
      }),

    getAdjacentItems: () =>
      Effect.sync(() => ({
        previousItemId: null,
        nextItemId: null,
      })),

    getQueuePosition: () =>
      Effect.sync(() => ({
        currentIndex: 1,
        totalItems: items.size,
      })),

    getNextUncompletedItem: ({ queueId }) =>
      Effect.sync(() => {
        const uncompleted = [...items.values()].find((i) => i.queueId === queueId && !i.completedAt)
        return uncompleted?.id ?? null
      }),

    update: ({ projectId, queueId, itemId, completedAt, completedBy, reviewStartedAt }) =>
      Effect.gen(function* () {
        const item = items.get(itemId)
        if (!item || item.projectId !== projectId || item.queueId !== queueId) {
          return yield* new NotFoundError({ entity: "AnnotationQueueItem", id: itemId })
        }
        const updated: AnnotationQueueItem = {
          ...item,
          ...(completedAt !== undefined && { completedAt }),
          ...(completedBy !== undefined && { completedBy }),
          ...(reviewStartedAt !== undefined && { reviewStartedAt }),
          updatedAt: new Date(),
        }
        items.set(itemId, updated)
        return updated
      }),
    bulkInsertIfNotExists: ({ projectId, queueId, items: inputItems }) => {
      let insertedCount = 0
      for (const { traceId, traceCreatedAt } of inputItems) {
        const exists = [...items.values()].some(
          (i) => i.projectId === projectId && i.queueId === queueId && i.traceId === traceId,
        )
        if (exists) continue

        const now = new Date()
        const newItem: AnnotationQueueItem = {
          id: AnnotationQueueItemId(generateId()),
          organizationId: "",
          projectId,
          queueId: AnnotationQueueId(queueId),
          traceId,
          traceCreatedAt,
          completedAt: null,
          completedBy: null,
          reviewStartedAt: null,
          createdAt: now,
          updatedAt: now,
        }
        items.set(newItem.id, newItem)
        insertedCount++
      }
      return Effect.succeed({ insertedCount })
    },

    ...overrides,
  }

  return { repository, items }
}
