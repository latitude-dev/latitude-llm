import {
  ChSqlClient,
  type ChSqlClientShape,
  ExternalUserId,
  OrganizationId,
  ProjectId,
  SessionId,
  SimulationId,
  SpanId,
  SqlClient,
  type SqlClientShape,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import type { Trace, TraceDetail } from "@domain/spans"
import { TraceRepository, type TraceRepositoryShape } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { MAX_TRACES_PER_QUEUE_IMPORT } from "../constants.ts"
import type { AnnotationQueue } from "../entities/annotation-queue.ts"
import { TooManyTracesSelectedError } from "../errors.ts"
import {
  AnnotationQueueItemRepository,
  type AnnotationQueueItemRepositoryShape,
} from "../ports/annotation-queue-item-repository.ts"
import { AnnotationQueueRepository, type AnnotationQueueRepositoryShape } from "../ports/annotation-queue-repository.ts"
import { createFakeAnnotationQueueItemRepository } from "../testing/fake-annotation-queue-item-repository.ts"
import { createFakeAnnotationQueueRepository } from "../testing/fake-annotation-queue-repository.ts"
import { createQueueFromTraces } from "./create-queue-from-traces.ts"

const PROJECT_ID = ProjectId("p".repeat(24))
const ORG_ID = OrganizationId("o".repeat(24))

const createTestLayer = (overrides?: {
  traceRepo?: Partial<TraceRepositoryShape>
  itemRepo?: Partial<AnnotationQueueItemRepositoryShape>
  queueRepo?: Partial<AnnotationQueueRepositoryShape>
}) => {
  const { repository: traceRepository } = createFakeTraceRepository(overrides?.traceRepo)
  const itemRepository = createFakeAnnotationQueueItemRepository(overrides?.itemRepo)
  const { repository: queueRepository, getLastSavedQueue } = createFakeAnnotationQueueRepository(overrides?.queueRepo)

  const fakeSqlClient: SqlClientShape<unknown> = {
    organizationId: ORG_ID,
    transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
    query: <T>() => Effect.succeed([] as unknown as T),
  }

  const fakeChSqlClient: ChSqlClientShape = createFakeChSqlClient({ organizationId: ORG_ID })

  return {
    layer: Layer.mergeAll(
      Layer.succeed(TraceRepository, traceRepository),
      Layer.succeed(AnnotationQueueItemRepository, itemRepository),
      Layer.succeed(AnnotationQueueRepository, queueRepository),
      Layer.succeed(SqlClient, fakeSqlClient),
      Layer.succeed(ChSqlClient, fakeChSqlClient),
    ),
    getLastSavedQueue,
  }
}

function makeTrace(suffix: string): Trace {
  return {
    traceId: TraceId(suffix.padEnd(32, "0").slice(0, 32)),
    startTime: new Date("2025-04-01T10:00:00.000Z"),
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    spanCount: 1,
    errorCount: 0,
    endTime: new Date("2025-04-01T10:00:01.000Z"),
    durationNs: 1_000_000_000,
    timeToFirstTokenNs: 0,
    tokensInput: 100,
    tokensOutput: 50,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    tokensTotal: 150,
    costInputMicrocents: 10,
    costOutputMicrocents: 5,
    costTotalMicrocents: 15,
    sessionId: SessionId(""),
    userId: ExternalUserId(""),
    simulationId: SimulationId(""),
    tags: [],
    metadata: {},
    models: ["gpt-4o"],
    providers: ["openai"],
    serviceNames: ["test"],
    rootSpanId: SpanId("r".repeat(16)),
    rootSpanName: "root",
  }
}

function makeTraceDetail(suffix: string): TraceDetail {
  return {
    ...makeTrace(suffix),
    systemInstructions: [],
    inputMessages: [],
    outputMessages: [],
    allMessages: [],
  }
}

describe("createQueueFromTraces", () => {
  describe("queue creation", () => {
    it("creates a new queue with correct properties", async () => {
      const traceIds = [TraceId("trace1".padEnd(32, "0"))]

      const { layer, getLastSavedQueue } = createTestLayer({
        traceRepo: {
          listByTraceIds: () => Effect.succeed(traceIds.map((id) => makeTraceDetail(id as string))),
        },
      })

      const result = await Effect.runPromise(
        createQueueFromTraces({
          projectId: PROJECT_ID,
          name: "My New Queue",
          selection: { mode: "selected", traceIds },
        }).pipe(Effect.provide(layer)),
      )

      expect(result.queueId).toBeDefined()
      expect(result.insertedCount).toBe(1)

      const savedQueue = getLastSavedQueue()
      expect(savedQueue).toBeDefined()
      expect(savedQueue?.name).toBe("My New Queue")
      expect(savedQueue?.slug).toBe("my-new-queue")
      expect(savedQueue?.description).toBe("")
      expect(savedQueue?.instructions).toBe("")
      expect(savedQueue?.settings).toEqual({})
      expect(savedQueue?.system).toBe(false)
      expect(savedQueue?.assignees).toEqual([])
      expect(savedQueue?.totalItems).toBe(0)
      expect(savedQueue?.completedItems).toBe(0)
    })

    it("creates queue even with empty trace selection", async () => {
      const { layer, getLastSavedQueue } = createTestLayer()

      const result = await Effect.runPromise(
        createQueueFromTraces({
          projectId: PROJECT_ID,
          name: "Empty Queue",
          selection: { mode: "selected", traceIds: [] },
        }).pipe(Effect.provide(layer)),
      )

      expect(result.queueId).toBeDefined()
      expect(result.insertedCount).toBe(0)

      const savedQueue = getLastSavedQueue()
      expect(savedQueue).toBeDefined()
      expect(savedQueue?.name).toBe("Empty Queue")
    })

    it("generates slug from queue name", async () => {
      const { layer, getLastSavedQueue } = createTestLayer()

      await Effect.runPromise(
        createQueueFromTraces({
          projectId: PROJECT_ID,
          name: "My Fancy Queue Name!",
          selection: { mode: "selected", traceIds: [] },
        }).pipe(Effect.provide(layer)),
      )

      const savedQueue = getLastSavedQueue()
      expect(savedQueue?.slug).toBe("my-fancy-queue-name")
    })
  })

  describe("selection resolution", () => {
    it("resolves selected traces and inserts them", async () => {
      const traceIds = [TraceId("sel1".padEnd(32, "0")), TraceId("sel2".padEnd(32, "0"))]

      let insertedItems: Array<{ traceId: TraceId; traceCreatedAt: Date }> = []

      const { layer } = createTestLayer({
        traceRepo: {
          listByTraceIds: () => Effect.succeed(traceIds.map((id) => makeTraceDetail(id as string))),
        },
        itemRepo: {
          bulkInsertIfNotExists: ({ items }) => {
            insertedItems = [...items]
            return Effect.succeed({ insertedCount: items.length })
          },
        },
      })

      const result = await Effect.runPromise(
        createQueueFromTraces({
          projectId: PROJECT_ID,
          name: "Selected Traces Queue",
          selection: { mode: "selected", traceIds },
        }).pipe(Effect.provide(layer)),
      )

      expect(result.insertedCount).toBe(2)
      expect(insertedItems).toHaveLength(2)
    })

    it("resolves all traces when mode is all", async () => {
      const allTraces = [makeTrace("all1"), makeTrace("all2"), makeTrace("all3")]

      const { layer } = createTestLayer({
        traceRepo: {
          listByProjectId: () => Effect.succeed({ items: allTraces, hasMore: false }),
        },
      })

      const result = await Effect.runPromise(
        createQueueFromTraces({
          projectId: PROJECT_ID,
          name: "All Traces Queue",
          selection: { mode: "all" },
        }).pipe(Effect.provide(layer)),
      )

      expect(result.insertedCount).toBe(3)
    })

    it("resolves allExcept traces correctly", async () => {
      const allTraces = [makeTrace("keep1"), makeTrace("exclude"), makeTrace("keep2")]

      let insertedItems: Array<{ traceId: TraceId; traceCreatedAt: Date }> = []

      const { layer } = createTestLayer({
        traceRepo: {
          listByProjectId: () => Effect.succeed({ items: allTraces, hasMore: false }),
        },
        itemRepo: {
          bulkInsertIfNotExists: ({ items }) => {
            insertedItems = [...items]
            return Effect.succeed({ insertedCount: items.length })
          },
        },
      })

      const excludeId = TraceId("exclude".padEnd(32, "0").slice(0, 32))

      const result = await Effect.runPromise(
        createQueueFromTraces({
          projectId: PROJECT_ID,
          name: "Except Queue",
          selection: { mode: "allExcept", traceIds: [excludeId] },
        }).pipe(Effect.provide(layer)),
      )

      expect(result.insertedCount).toBe(2)
      const insertedTraceIds = insertedItems.map((i) => i.traceId as string)
      expect(insertedTraceIds).not.toContain(excludeId)
    })
  })

  describe("error handling", () => {
    it("fails with TooManyTracesSelectedError when selection exceeds limit", async () => {
      const tooManyIds = Array.from({ length: MAX_TRACES_PER_QUEUE_IMPORT + 1 }, (_, i) =>
        TraceId(`trace${i}`.padEnd(32, "0")),
      )

      const { layer } = createTestLayer()

      const error = await Effect.runPromise(
        createQueueFromTraces({
          projectId: PROJECT_ID,
          name: "Too Large Queue",
          selection: { mode: "selected", traceIds: tooManyIds },
        }).pipe(Effect.provide(layer), Effect.flip),
      )

      expect(error).toBeInstanceOf(TooManyTracesSelectedError)
      expect((error as TooManyTracesSelectedError).count).toBe(MAX_TRACES_PER_QUEUE_IMPORT + 1)
      expect((error as TooManyTracesSelectedError).limit).toBe(MAX_TRACES_PER_QUEUE_IMPORT)
    })

    it("fails with TooManyTracesSelectedError when all mode exceeds limit", async () => {
      const tooManyTraces = Array.from({ length: MAX_TRACES_PER_QUEUE_IMPORT + 1 }, (_, i) => makeTrace(`all${i}`))

      const { layer } = createTestLayer({
        traceRepo: {
          listByProjectId: () => Effect.succeed({ items: tooManyTraces, hasMore: false }),
        },
      })

      const error = await Effect.runPromise(
        createQueueFromTraces({
          projectId: PROJECT_ID,
          name: "Too Large All Queue",
          selection: { mode: "all" },
        }).pipe(Effect.provide(layer), Effect.flip),
      )

      expect(error).toBeInstanceOf(TooManyTracesSelectedError)
    })
  })

  describe("counter updates", () => {
    it("increments totalItems after bulk insert", async () => {
      const traceIds = [TraceId("cnt1".padEnd(32, "0")), TraceId("cnt2".padEnd(32, "0"))]

      let incrementDelta = 0

      const { layer } = createTestLayer({
        traceRepo: {
          listByTraceIds: () => Effect.succeed(traceIds.map((id) => makeTraceDetail(id as string))),
        },
        itemRepo: {
          bulkInsertIfNotExists: () => Effect.succeed({ insertedCount: 2 }),
        },
        queueRepo: {
          incrementTotalItems: ({ delta }) => {
            incrementDelta = delta ?? 1
            return Effect.succeed({} as AnnotationQueue)
          },
        },
      })

      await Effect.runPromise(
        createQueueFromTraces({
          projectId: PROJECT_ID,
          name: "Counter Queue",
          selection: { mode: "selected", traceIds },
        }).pipe(Effect.provide(layer)),
      )

      expect(incrementDelta).toBe(2)
    })

    it("does not increment counter when no items inserted", async () => {
      let incrementCalled = false

      const { layer } = createTestLayer({
        queueRepo: {
          incrementTotalItems: () => {
            incrementCalled = true
            return Effect.succeed({} as AnnotationQueue)
          },
        },
      })

      await Effect.runPromise(
        createQueueFromTraces({
          projectId: PROJECT_ID,
          name: "No Items Queue",
          selection: { mode: "selected", traceIds: [] },
        }).pipe(Effect.provide(layer)),
      )

      expect(incrementCalled).toBe(false)
    })
  })

  describe("idempotency", () => {
    it("returns correct count when some items already exist", async () => {
      const traceIds = [TraceId("new".padEnd(32, "0")), TraceId("existing".padEnd(32, "0"))]

      const { layer } = createTestLayer({
        traceRepo: {
          listByTraceIds: () => Effect.succeed(traceIds.map((id) => makeTraceDetail(id as string))),
        },
        itemRepo: {
          bulkInsertIfNotExists: () => Effect.succeed({ insertedCount: 1 }),
        },
      })

      const result = await Effect.runPromise(
        createQueueFromTraces({
          projectId: PROJECT_ID,
          name: "Partial Insert Queue",
          selection: { mode: "selected", traceIds },
        }).pipe(Effect.provide(layer)),
      )

      expect(result.insertedCount).toBe(1)
    })
  })
})
