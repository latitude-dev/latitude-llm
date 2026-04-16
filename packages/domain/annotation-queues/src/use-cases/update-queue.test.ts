import { AnnotationQueueId, OrganizationId, ProjectId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { AnnotationQueue } from "../entities/annotation-queue.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"
import { createFakeAnnotationQueueRepository } from "../testing/fake-annotation-queue-repository.ts"
import { QueueNotFoundError, type UpdateQueueInput, updateQueueUseCase } from "./update-queue.ts"

const PROJECT_ID = ProjectId("p".repeat(24))
const ORG_ID = OrganizationId("o".repeat(24))
const QUEUE_ID = AnnotationQueueId("q".repeat(24))

function createExistingQueue(overrides?: Partial<AnnotationQueue>): AnnotationQueue {
  return {
    id: QUEUE_ID,
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    system: false,
    name: "Original Name",
    slug: "original-name",
    description: "Original description",
    instructions: "Original instructions",
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

describe("updateQueueUseCase", () => {
  describe("user-created queues", () => {
    it("updates all fields for user queue", async () => {
      const existing = createExistingQueue()
      const { layer, getLastSavedQueue } = createTestLayer(existing)

      const input: UpdateQueueInput = {
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        name: "Updated Name",
        description: "Updated description",
        instructions: "Updated instructions",
        assignees: ["user-2", "user-3"],
        settings: { sampling: 25 },
      }

      const result = await Effect.runPromise(updateQueueUseCase(input).pipe(Effect.provide(layer)))

      expect(result.queue.name).toBe("Updated Name")
      expect(result.queue.description).toBe("Updated description")
      expect(result.queue.instructions).toBe("Updated instructions")
      expect(result.queue.assignees).toEqual(["user-2", "user-3"])
      expect(result.queue.settings.sampling).toBe(25)

      const saved = getLastSavedQueue()
      expect(saved?.name).toBe("Updated Name")
    })

    it("regenerates slug when name changes", async () => {
      const existing = createExistingQueue()
      const { layer } = createTestLayer(existing)

      const input: UpdateQueueInput = {
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        name: "New Queue Name",
        description: existing.description,
        instructions: existing.instructions,
      }

      const result = await Effect.runPromise(updateQueueUseCase(input).pipe(Effect.provide(layer)))

      expect(result.queue.slug).toBe("new-queue-name")
    })

    it("keeps slug unchanged when name is not updated", async () => {
      const existing = createExistingQueue()
      const { layer } = createTestLayer(existing)

      const input: UpdateQueueInput = {
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        description: "New description",
        instructions: existing.instructions,
      }

      const result = await Effect.runPromise(updateQueueUseCase(input).pipe(Effect.provide(layer)))

      expect(result.queue.slug).toBe("original-name")
    })

    it("updates filter settings", async () => {
      const existing = createExistingQueue()
      const { layer } = createTestLayer(existing)

      const input: UpdateQueueInput = {
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        description: existing.description,
        instructions: existing.instructions,
        settings: {
          filter: { status: [{ op: "in", value: ["error"] }] },
          sampling: 50,
        },
      }

      const result = await Effect.runPromise(updateQueueUseCase(input).pipe(Effect.provide(layer)))

      expect(result.queue.settings.filter).toEqual({ status: [{ op: "in", value: ["error"] }] })
      expect(result.queue.settings.sampling).toBe(50)
    })

    it("normalizes empty filter to undefined", async () => {
      const existing = createExistingQueue({
        settings: { filter: { status: [{ op: "in", value: ["error"] }] } },
      })
      const { layer } = createTestLayer(existing)

      const input: UpdateQueueInput = {
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        description: existing.description,
        instructions: existing.instructions,
        settings: {
          filter: { status: [] },
        },
      }

      const result = await Effect.runPromise(updateQueueUseCase(input).pipe(Effect.provide(layer)))

      expect(result.queue.settings.filter).toBeUndefined()
    })

    it("preserves existing settings when not updating them", async () => {
      const existing = createExistingQueue({
        settings: { filter: { status: [{ op: "in", value: ["error"] }] }, sampling: 30 },
      })
      const { layer } = createTestLayer(existing)

      const input: UpdateQueueInput = {
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        description: "New description",
        instructions: existing.instructions,
      }

      const result = await Effect.runPromise(updateQueueUseCase(input).pipe(Effect.provide(layer)))

      expect(result.queue.settings.filter).toEqual({ status: [{ op: "in", value: ["error"] }] })
      expect(result.queue.settings.sampling).toBe(30)
    })
  })

  describe("system queues", () => {
    it("allows updating assignees for system queue", async () => {
      const existing = createExistingQueue({ system: true })
      const { layer } = createTestLayer(existing)

      const input: UpdateQueueInput = {
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        description: existing.description,
        instructions: existing.instructions,
        assignees: ["user-new"],
      }

      const result = await Effect.runPromise(updateQueueUseCase(input).pipe(Effect.provide(layer)))

      expect(result.queue.assignees).toEqual(["user-new"])
    })

    it("ignores sampling change for system queue", async () => {
      const existing = createExistingQueue({ system: true, settings: { sampling: 10 } })
      const { layer } = createTestLayer(existing)

      const input: UpdateQueueInput = {
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        description: existing.description,
        instructions: existing.instructions,
        settings: { sampling: 50 },
      }

      const result = await Effect.runPromise(updateQueueUseCase(input).pipe(Effect.provide(layer)))

      expect(result.queue.settings.sampling).toBe(10)
    })

    it("ignores name change for system queue", async () => {
      const existing = createExistingQueue({ system: true })
      const { layer } = createTestLayer(existing)

      const input: UpdateQueueInput = {
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        name: "Attempted New Name",
        description: existing.description,
        instructions: existing.instructions,
      }

      const result = await Effect.runPromise(updateQueueUseCase(input).pipe(Effect.provide(layer)))

      expect(result.queue.name).toBe("Original Name")
      expect(result.queue.slug).toBe("original-name")
    })

    it("ignores filter change for system queue", async () => {
      const existing = createExistingQueue({ system: true })
      const { layer } = createTestLayer(existing)

      const input: UpdateQueueInput = {
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        description: existing.description,
        instructions: existing.instructions,
        settings: {
          filter: { status: [{ op: "in", value: ["error"] }] },
        },
      }

      const result = await Effect.runPromise(updateQueueUseCase(input).pipe(Effect.provide(layer)))

      expect(result.queue.settings.filter).toBeUndefined()
    })
  })

  describe("error cases", () => {
    it("returns QueueNotFoundError when queue does not exist", async () => {
      const { layer } = createTestLayer()

      const input: UpdateQueueInput = {
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        description: "desc",
        instructions: "inst",
      }

      const result = await Effect.runPromise(updateQueueUseCase(input).pipe(Effect.flip, Effect.provide(layer)))

      expect(result).toBeInstanceOf(QueueNotFoundError)
      expect((result as QueueNotFoundError).queueId).toBe(QUEUE_ID)
    })

    it("returns QueueNotFoundError for deleted queue", async () => {
      const existing = createExistingQueue({ deletedAt: new Date() })
      const { layer } = createTestLayer(existing)

      const input: UpdateQueueInput = {
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        description: "desc",
        instructions: "inst",
      }

      const result = await Effect.runPromise(updateQueueUseCase(input).pipe(Effect.flip, Effect.provide(layer)))

      expect(result).toBeInstanceOf(QueueNotFoundError)
    })
  })
})
