import { QueuePublisher, type QueuePublisherShape } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import {
  type AnnotationQueueId,
  BadRequestError,
  ChSqlClient,
  type ChSqlClientShape,
  OrganizationId,
  ProjectId,
  SqlClient,
  type SqlClientShape,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { AnnotationQueueRepository, type AnnotationQueueRepositoryShape } from "../ports/annotation-queue-repository.ts"
import { createFakeAnnotationQueueRepository } from "../testing/fake-annotation-queue-repository.ts"
import { type RequestBulkQueueItemsInput, requestBulkQueueItems } from "./request-bulk-queue-items.ts"

const PROJECT_ID = ProjectId("p".repeat(24))
const ORG_ID = OrganizationId("o".repeat(24))
const QUEUE_ID = "q".repeat(24) as AnnotationQueueId

function createTestLayer(overrides?: {
  queueRepo?: Partial<AnnotationQueueRepositoryShape>
  publisher?: Partial<QueuePublisherShape>
}) {
  const { repository: queueRepository, getLastSavedQueue } = createFakeAnnotationQueueRepository(overrides?.queueRepo)
  const { publisher, published } = createFakeQueuePublisher(overrides?.publisher)

  const fakeSqlClient: SqlClientShape<unknown> = {
    organizationId: ORG_ID,
    transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
    query: <T>() => Effect.succeed([] as unknown as T),
  }

  const fakeChSqlClient: ChSqlClientShape = createFakeChSqlClient({ organizationId: ORG_ID })

  return {
    layer: Layer.mergeAll(
      Layer.succeed(AnnotationQueueRepository, queueRepository),
      Layer.succeed(QueuePublisher, publisher),
      Layer.succeed(SqlClient, fakeSqlClient),
      Layer.succeed(ChSqlClient, fakeChSqlClient),
    ),
    getLastSavedQueue,
    published,
  }
}

describe("requestBulkQueueItems", () => {
  describe("with existing queueId", () => {
    it("validates queue exists and publishes bulk import task", async () => {
      const { layer, published } = createTestLayer({
        queueRepo: {
          findByIdInProject: () =>
            Effect.succeed({
              id: QUEUE_ID,
              organizationId: ORG_ID,
              projectId: PROJECT_ID,
              system: false,
              name: "Test Queue",
              slug: "test-queue",
              description: "",
              instructions: "",
              settings: {},
              assignees: [],
              totalItems: 0,
              completedItems: 0,
              deletedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
        },
      })

      const input: RequestBulkQueueItemsInput = {
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        selection: { mode: "selected", traceIds: [TraceId("t".repeat(32))] },
      }

      const result = await Effect.runPromise(requestBulkQueueItems(input).pipe(Effect.provide(layer)))

      expect(result.queueId).toBe(QUEUE_ID)
      expect(published).toHaveLength(1)
      expect(published[0]).toMatchObject({
        queue: "annotation-queues",
        task: "bulkImport",
        payload: {
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          queueId: QUEUE_ID,
          selection: { mode: "selected", traceIds: ["t".repeat(32)] },
        },
      })
    })

    it("returns BadRequestError when queue does not exist", async () => {
      const { layer } = createTestLayer({
        queueRepo: {
          findByIdInProject: () => Effect.succeed(null),
        },
      })

      const input: RequestBulkQueueItemsInput = {
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        selection: { mode: "selected", traceIds: [] },
      }

      const result = await Effect.runPromise(requestBulkQueueItems(input).pipe(Effect.flip, Effect.provide(layer)))

      expect(result).toBeInstanceOf(BadRequestError)
      expect((result as BadRequestError).message).toContain("not found")
    })
  })

  describe("with newQueue", () => {
    it("creates new queue and publishes bulk import task", async () => {
      const { layer, getLastSavedQueue, published } = createTestLayer()

      const input: RequestBulkQueueItemsInput = {
        projectId: PROJECT_ID,
        newQueue: {
          name: "My New Queue",
          description: "Queue description",
          instructions: "Queue instructions",
        },
        selection: { mode: "all", filters: { level: [{ op: "eq", value: "error" }] } },
      }

      const result = await Effect.runPromise(requestBulkQueueItems(input).pipe(Effect.provide(layer)))

      expect(result.queueId).toBeDefined()
      expect(typeof result.queueId).toBe("string")

      const savedQueue = getLastSavedQueue()
      expect(savedQueue).not.toBeNull()
      expect(savedQueue?.name).toBe("My New Queue")
      expect(savedQueue?.slug).toBe("my-new-queue")
      expect(savedQueue?.projectId).toBe(PROJECT_ID)
      expect(savedQueue?.description).toBe("Queue description")
      expect(savedQueue?.instructions).toBe("Queue instructions")

      expect(published).toHaveLength(1)
      expect(published[0]).toMatchObject({
        queue: "annotation-queues",
        task: "bulkImport",
        payload: {
          selection: { mode: "all", filters: { level: [{ op: "eq", value: "error" }] } },
        },
      })
    })

    it("creates new queue with full settings including live filters", async () => {
      const { layer, getLastSavedQueue, published } = createTestLayer()

      const input: RequestBulkQueueItemsInput = {
        projectId: PROJECT_ID,
        newQueue: {
          name: "Live Queue",
          description: "A live queue for errors",
          instructions: "Review all error traces carefully",
          assignees: ["user-1", "user-2"],
          settings: {
            filter: { status: [{ op: "in", value: ["error"] }] },
            sampling: 50,
          },
        },
        selection: { mode: "selected", traceIds: [TraceId("t".repeat(32))] },
      }

      const result = await Effect.runPromise(requestBulkQueueItems(input).pipe(Effect.provide(layer)))

      expect(result.queueId).toBeDefined()

      const savedQueue = getLastSavedQueue()
      expect(savedQueue).not.toBeNull()
      expect(savedQueue?.name).toBe("Live Queue")
      expect(savedQueue?.description).toBe("A live queue for errors")
      expect(savedQueue?.instructions).toBe("Review all error traces carefully")
      expect(savedQueue?.assignees).toEqual(["user-1", "user-2"])
      expect(savedQueue?.settings.filter).toEqual({ status: [{ op: "in", value: ["error"] }] })
      expect(savedQueue?.settings.sampling).toBe(50)

      expect(published).toHaveLength(1)
    })

    it("serializes allExcept selection correctly", async () => {
      const { layer, published } = createTestLayer()
      const excludedIds = [TraceId("a".repeat(32)), TraceId("b".repeat(32))]

      const input: RequestBulkQueueItemsInput = {
        projectId: PROJECT_ID,
        newQueue: {
          name: "Exclude Queue",
          description: "Queue description",
          instructions: "Queue instructions",
        },
        selection: { mode: "allExcept", traceIds: excludedIds },
      }

      await Effect.runPromise(requestBulkQueueItems(input).pipe(Effect.provide(layer)))

      expect(published).toHaveLength(1)
      expect(published[0]?.payload).toMatchObject({
        selection: {
          mode: "allExcept",
          traceIds: ["a".repeat(32), "b".repeat(32)],
        },
      })
    })
  })
})
