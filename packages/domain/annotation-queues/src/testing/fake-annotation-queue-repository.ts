import { AnnotationQueueId, OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { AnnotationQueue } from "../entities/annotation-queue.ts"
import type { AnnotationQueueRepositoryShape } from "../ports/annotation-queue-repository.ts"

export const createFakeAnnotationQueueRepository = (
  seedOrOverrides?: readonly AnnotationQueue[] | Partial<AnnotationQueueRepositoryShape>,
  maybeOverrides?: Partial<AnnotationQueueRepositoryShape>,
) => {
  const seed = Array.isArray(seedOrOverrides) ? seedOrOverrides : []
  const overrides = Array.isArray(seedOrOverrides) ? maybeOverrides : seedOrOverrides

  const queues = new Map<string, AnnotationQueue>(seed.map((queue) => [queue.id, queue] as const))

  const repository: AnnotationQueueRepositoryShape = {
    listByProject: ({ projectId, options }) =>
      Effect.sync(() => {
        const filtered = [...queues.values()].filter((q) => q.projectId === projectId && !q.deletedAt)
        const limit = options?.limit ?? 50
        return {
          items: filtered.slice(0, limit),
          hasMore: filtered.length > limit,
        }
      }),

    listSystemQueuesByProject: ({ projectId }) =>
      Effect.sync(() => [...queues.values()].filter((q) => q.projectId === projectId && q.system && !q.deletedAt)),

    findByIdInProject: ({ projectId, queueId }) =>
      Effect.sync(() => {
        const queue = queues.get(queueId)
        if (!queue || queue.projectId !== projectId || queue.deletedAt) return null
        return queue
      }),

    findBySlugInProject: ({ projectId, queueSlug }) =>
      Effect.sync(() => {
        const queue = [...queues.values()].find(
          (q) => q.projectId === projectId && q.slug === queueSlug && !q.deletedAt,
        )
        return queue ?? null
      }),

    findSystemQueueBySlugInProject: ({ projectId, queueSlug }) =>
      Effect.sync(() => {
        const queue = [...queues.values()].find(
          (q) => q.projectId === projectId && q.slug === queueSlug && q.system && !q.deletedAt,
        )
        return queue ?? null
      }),

    save: (queue) =>
      Effect.sync(() => {
        queues.set(queue.id, queue)
      }),

    insertIfNotExists: (queue) =>
      Effect.sync(() => {
        if (queues.has(queue.id)) return false
        queues.set(queue.id, queue)
        return true
      }),

    incrementCompletedItems: ({ queueId, delta }) =>
      Effect.sync(() => {
        const queue = queues.get(queueId)
        if (queue) {
          queues.set(queueId, {
            ...queue,
            completedItems: Math.max(0, queue.completedItems + delta),
            updatedAt: new Date(),
          })
        }
      }),

    incrementTotalItems: ({ queueId, delta = 1 }) =>
      Effect.succeed({
        id: AnnotationQueueId(queueId),
        organizationId: OrganizationId("fake-org".padEnd(24, "0")),
        projectId: ProjectId("fake-project".padEnd(24, "0")),
        system: false,
        name: "Fake Queue",
        slug: "fake-queue",
        description: "",
        instructions: "",
        settings: {},
        assignees: [],
        totalItems: delta,
        completedItems: 0,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),

    ...overrides,
  }

  let lastSavedQueue: AnnotationQueue | null = null
  const originalSave = repository.save
  repository.save = (queue) => {
    lastSavedQueue = queue
    return originalSave(queue)
  }

  const getLastSavedQueue = () => lastSavedQueue

  return { repository, queues, getLastSavedQueue }
}
