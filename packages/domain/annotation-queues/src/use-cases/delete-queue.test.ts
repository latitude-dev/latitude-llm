import { AnnotationQueueId, OrganizationId, ProjectId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { AnnotationQueue } from "../entities/annotation-queue.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"
import { createFakeAnnotationQueueRepository } from "../testing/fake-annotation-queue-repository.ts"
import { type DeleteQueueInput, DeleteQueueNotFoundError, deleteQueueUseCase } from "./delete-queue.ts"

const PROJECT_ID = ProjectId("p".repeat(24))
const ORG_ID = OrganizationId("o".repeat(24))
const QUEUE_ID = AnnotationQueueId("q".repeat(24))

function createExistingQueue(overrides?: Partial<AnnotationQueue>): AnnotationQueue {
  return {
    id: QUEUE_ID,
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    system: false,
    name: "Test Queue",
    slug: "test-queue",
    description: "Test description",
    instructions: "Test instructions",
    settings: {},
    assignees: ["user-1"],
    totalItems: 10,
    completedItems: 5,
    deletedAt: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  }
}

function createTestLayer(existingQueue?: AnnotationQueue) {
  const seed = existingQueue ? [existingQueue] : []
  const { repository, getLastSavedQueue } = createFakeAnnotationQueueRepository(seed)
  return {
    layer: Layer.succeed(AnnotationQueueRepository, repository),
    getLastSavedQueue,
  }
}

describe("deleteQueueUseCase", () => {
  it("sets deletedAt timestamp on queue", async () => {
    const existing = createExistingQueue()
    const { layer, getLastSavedQueue } = createTestLayer(existing)

    const input: DeleteQueueInput = {
      projectId: PROJECT_ID,
      queueId: QUEUE_ID,
    }

    const result = await Effect.runPromise(deleteQueueUseCase(input).pipe(Effect.provide(layer)))

    expect(result.queue.deletedAt).not.toBeNull()
    expect(result.queue.deletedAt).toBeInstanceOf(Date)

    const saved = getLastSavedQueue()
    expect(saved?.deletedAt).not.toBeNull()
  })

  it("updates updatedAt timestamp", async () => {
    const originalDate = new Date("2024-01-01")
    const existing = createExistingQueue({ updatedAt: originalDate })
    const { layer } = createTestLayer(existing)

    const input: DeleteQueueInput = {
      projectId: PROJECT_ID,
      queueId: QUEUE_ID,
    }

    const result = await Effect.runPromise(deleteQueueUseCase(input).pipe(Effect.provide(layer)))

    expect(result.queue.updatedAt.getTime()).toBeGreaterThan(originalDate.getTime())
  })

  it("returns the deleted queue", async () => {
    const existing = createExistingQueue()
    const { layer } = createTestLayer(existing)

    const input: DeleteQueueInput = {
      projectId: PROJECT_ID,
      queueId: QUEUE_ID,
    }

    const result = await Effect.runPromise(deleteQueueUseCase(input).pipe(Effect.provide(layer)))

    expect(result.queue.id).toBe(QUEUE_ID)
    expect(result.queue.name).toBe("Test Queue")
  })

  it("can delete system queues", async () => {
    const existing = createExistingQueue({ system: true })
    const { layer, getLastSavedQueue } = createTestLayer(existing)

    const input: DeleteQueueInput = {
      projectId: PROJECT_ID,
      queueId: QUEUE_ID,
    }

    const result = await Effect.runPromise(deleteQueueUseCase(input).pipe(Effect.provide(layer)))

    expect(result.queue.deletedAt).not.toBeNull()
    expect(result.queue.system).toBe(true)

    const saved = getLastSavedQueue()
    expect(saved?.deletedAt).not.toBeNull()
  })

  it("preserves existing queue data", async () => {
    const existing = createExistingQueue({
      totalItems: 42,
      completedItems: 20,
      settings: { sampling: 30 },
    })
    const { layer } = createTestLayer(existing)

    const input: DeleteQueueInput = {
      projectId: PROJECT_ID,
      queueId: QUEUE_ID,
    }

    const result = await Effect.runPromise(deleteQueueUseCase(input).pipe(Effect.provide(layer)))

    expect(result.queue.totalItems).toBe(42)
    expect(result.queue.completedItems).toBe(20)
    expect(result.queue.settings.sampling).toBe(30)
  })

  describe("error cases", () => {
    it("returns DeleteQueueNotFoundError when queue does not exist", async () => {
      const { layer } = createTestLayer()

      const input: DeleteQueueInput = {
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
      }

      const result = await Effect.runPromise(deleteQueueUseCase(input).pipe(Effect.flip, Effect.provide(layer)))

      expect(result).toBeInstanceOf(DeleteQueueNotFoundError)
      expect((result as DeleteQueueNotFoundError).queueId).toBe(QUEUE_ID)
    })

    it("returns DeleteQueueNotFoundError for already deleted queue", async () => {
      const existing = createExistingQueue({ deletedAt: new Date() })
      const { layer } = createTestLayer(existing)

      const input: DeleteQueueInput = {
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
      }

      const result = await Effect.runPromise(deleteQueueUseCase(input).pipe(Effect.flip, Effect.provide(layer)))

      expect(result).toBeInstanceOf(DeleteQueueNotFoundError)
    })

    it("returns DeleteQueueNotFoundError for wrong project", async () => {
      const existing = createExistingQueue()
      const { layer } = createTestLayer(existing)

      const input: DeleteQueueInput = {
        projectId: ProjectId("different".padEnd(24, "0")),
        queueId: QUEUE_ID,
      }

      const result = await Effect.runPromise(deleteQueueUseCase(input).pipe(Effect.flip, Effect.provide(layer)))

      expect(result).toBeInstanceOf(DeleteQueueNotFoundError)
    })
  })
})
