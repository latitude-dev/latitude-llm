import { OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { LIVE_QUEUE_DEFAULT_SAMPLING } from "../constants.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"
import { createFakeAnnotationQueueRepository } from "../testing/fake-annotation-queue-repository.ts"
import { type CreateQueueInput, createQueueUseCase } from "./create-queue.ts"

const PROJECT_ID = ProjectId("p".repeat(24))
const ORG_ID = OrganizationId("o".repeat(24))

function createTestLayer() {
  const { repository, getLastSavedQueue } = createFakeAnnotationQueueRepository()
  return {
    layer: Layer.mergeAll(
      Layer.succeed(AnnotationQueueRepository, repository),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
    ),
    getLastSavedQueue,
  }
}

describe("createQueueUseCase", () => {
  it("creates queue with valid input", async () => {
    const { layer, getLastSavedQueue } = createTestLayer()

    const input: CreateQueueInput = {
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      name: "My Test Queue",
      description: "Test description",
      instructions: "Test instructions",
    }

    const result = await Effect.runPromise(createQueueUseCase(input).pipe(Effect.provide(layer)))

    expect(result.queue).toBeDefined()
    expect(result.queue.name).toBe("My Test Queue")
    expect(result.queue.description).toBe("Test description")
    expect(result.queue.instructions).toBe("Test instructions")
    expect(result.queue.system).toBe(false)
    expect(result.queue.totalItems).toBe(0)
    expect(result.queue.completedItems).toBe(0)
    expect(result.queue.deletedAt).toBeNull()

    const saved = getLastSavedQueue()
    expect(saved).not.toBeNull()
    expect(saved?.name).toBe("My Test Queue")
  })

  it("generates slug from name correctly", async () => {
    const { layer } = createTestLayer()

    const input: CreateQueueInput = {
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      name: "My Test Queue With Spaces",
      description: "desc",
      instructions: "inst",
    }

    const result = await Effect.runPromise(createQueueUseCase(input).pipe(Effect.provide(layer)))

    expect(result.queue.slug).toBe("my-test-queue-with-spaces")
  })

  it("generates slug from name with special characters", async () => {
    const { layer } = createTestLayer()

    const input: CreateQueueInput = {
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      name: "Queue @#$ Special!",
      description: "desc",
      instructions: "inst",
    }

    const result = await Effect.runPromise(createQueueUseCase(input).pipe(Effect.provide(layer)))

    expect(result.queue.slug).toBe("queue-special")
  })

  it("creates manual queue with empty settings when no filter provided", async () => {
    const { layer } = createTestLayer()

    const input: CreateQueueInput = {
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      name: "Manual Queue",
      description: "desc",
      instructions: "inst",
    }

    const result = await Effect.runPromise(createQueueUseCase(input).pipe(Effect.provide(layer)))

    expect(result.queue.settings.filter).toBeUndefined()
    expect(result.queue.settings.sampling).toBeUndefined()
  })

  it("sets default sampling for live queues with filter", async () => {
    const { layer } = createTestLayer()

    const input: CreateQueueInput = {
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      name: "Live Queue",
      description: "desc",
      instructions: "inst",
      settings: {
        filter: { status: [{ op: "in", value: ["error"] }] },
      },
    }

    const result = await Effect.runPromise(createQueueUseCase(input).pipe(Effect.provide(layer)))

    expect(result.queue.settings.filter).toEqual({ status: [{ op: "in", value: ["error"] }] })
    expect(result.queue.settings.sampling).toBe(LIVE_QUEUE_DEFAULT_SAMPLING)
  })

  it("respects explicit sampling when provided", async () => {
    const { layer } = createTestLayer()

    const input: CreateQueueInput = {
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      name: "Live Queue",
      description: "desc",
      instructions: "inst",
      settings: {
        filter: { status: [{ op: "in", value: ["error"] }] },
        sampling: 50,
      },
    }

    const result = await Effect.runPromise(createQueueUseCase(input).pipe(Effect.provide(layer)))

    expect(result.queue.settings.sampling).toBe(50)
  })

  it("uses provided assignees", async () => {
    const { layer } = createTestLayer()

    const input: CreateQueueInput = {
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      name: "Queue with Assignees",
      description: "desc",
      instructions: "inst",
      assignees: ["user-1", "user-2"],
    }

    const result = await Effect.runPromise(createQueueUseCase(input).pipe(Effect.provide(layer)))

    expect(result.queue.assignees).toEqual(["user-1", "user-2"])
  })

  it("defaults assignees to empty array", async () => {
    const { layer } = createTestLayer()

    const input: CreateQueueInput = {
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      name: "Queue",
      description: "desc",
      instructions: "inst",
    }

    const result = await Effect.runPromise(createQueueUseCase(input).pipe(Effect.provide(layer)))

    expect(result.queue.assignees).toEqual([])
  })

  it("normalizes empty filter conditions", async () => {
    const { layer } = createTestLayer()

    const input: CreateQueueInput = {
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      name: "Queue",
      description: "desc",
      instructions: "inst",
      settings: {
        filter: { status: [] },
      },
    }

    const result = await Effect.runPromise(createQueueUseCase(input).pipe(Effect.provide(layer)))

    expect(result.queue.settings.filter).toBeUndefined()
  })

  it("returns queue with DB-generated id", async () => {
    const { layer } = createTestLayer()

    const input: CreateQueueInput = {
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      name: "Queue",
      description: "desc",
      instructions: "inst",
    }

    const result = await Effect.runPromise(createQueueUseCase(input).pipe(Effect.provide(layer)))

    expect(result.queue.id).toBeDefined()
    expect(typeof result.queue.id).toBe("string")
    expect(result.queue.id.length).toBeGreaterThan(0)
  })
})
