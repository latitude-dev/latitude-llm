import {
  AnnotationQueueId,
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
import { addTracesToQueue } from "./add-traces-to-queue.ts"

const PROJECT_ID = ProjectId("p".repeat(24))
const QUEUE_ID = AnnotationQueueId("q".repeat(24))
const ORG_ID = OrganizationId("o".repeat(24))

const createTestLayer = (overrides?: {
  traceRepo?: Partial<TraceRepositoryShape>
  itemRepo?: Partial<AnnotationQueueItemRepositoryShape>
  queueRepo?: Partial<AnnotationQueueRepositoryShape>
}) => {
  const { repository: traceRepository } = createFakeTraceRepository(overrides?.traceRepo)
  const { repository: itemRepository } = createFakeAnnotationQueueItemRepository(overrides?.itemRepo)
  const { repository: queueRepository } = createFakeAnnotationQueueRepository(overrides?.queueRepo)

  const fakeSqlClient: SqlClientShape<unknown> = {
    organizationId: ORG_ID,
    transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
    query: <T>() => Effect.succeed([] as unknown as T),
  }

  const fakeChSqlClient: ChSqlClientShape = createFakeChSqlClient({ organizationId: ORG_ID })

  return Layer.mergeAll(
    Layer.succeed(TraceRepository, traceRepository),
    Layer.succeed(AnnotationQueueItemRepository, itemRepository),
    Layer.succeed(AnnotationQueueRepository, queueRepository),
    Layer.succeed(SqlClient, fakeSqlClient),
    Layer.succeed(ChSqlClient, fakeChSqlClient),
  )
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

describe("addTracesToQueue", () => {
  describe("selection mode: selected", () => {
    it("resolves traces by IDs and inserts them", async () => {
      const traceIds = [TraceId("trace1".padEnd(32, "0")), TraceId("trace2".padEnd(32, "0"))]

      let bulkInsertCalled = false
      let insertedItems: Array<{ traceId: TraceId; traceCreatedAt: Date }> = []

      const layer = createTestLayer({
        traceRepo: {
          listByTraceIds: () => Effect.succeed(traceIds.map((id) => makeTraceDetail(id as string))),
        },
        itemRepo: {
          bulkInsertIfNotExists: ({ items }) => {
            bulkInsertCalled = true
            insertedItems = [...items]
            return Effect.succeed({ insertedCount: items.length })
          },
        },
      })

      const result = await Effect.runPromise(
        addTracesToQueue({
          projectId: PROJECT_ID,
          queueId: QUEUE_ID,
          selection: { mode: "selected", traceIds },
        }).pipe(Effect.provide(layer)),
      )

      expect(result.insertedCount).toBe(2)
      expect(bulkInsertCalled).toBe(true)
      expect(insertedItems).toHaveLength(2)
    })

    it("returns 0 when no traces are provided", async () => {
      const layer = createTestLayer()

      const result = await Effect.runPromise(
        addTracesToQueue({
          projectId: PROJECT_ID,
          queueId: QUEUE_ID,
          selection: { mode: "selected", traceIds: [] },
        }).pipe(Effect.provide(layer)),
      )

      expect(result.insertedCount).toBe(0)
    })

    it("fails with TooManyTracesSelectedError when selection exceeds limit", async () => {
      const tooManyIds = Array.from({ length: MAX_TRACES_PER_QUEUE_IMPORT + 1 }, (_, i) =>
        TraceId(`trace${i}`.padEnd(32, "0")),
      )

      const layer = createTestLayer()

      const error = await Effect.runPromise(
        addTracesToQueue({
          projectId: PROJECT_ID,
          queueId: QUEUE_ID,
          selection: { mode: "selected", traceIds: tooManyIds },
        }).pipe(Effect.provide(layer), Effect.flip),
      )

      expect(error).toBeInstanceOf(TooManyTracesSelectedError)
      expect((error as TooManyTracesSelectedError).count).toBe(MAX_TRACES_PER_QUEUE_IMPORT + 1)
      expect((error as TooManyTracesSelectedError).limit).toBe(MAX_TRACES_PER_QUEUE_IMPORT)
    })
  })

  describe("selection mode: all", () => {
    it("fetches all traces from project and inserts them", async () => {
      const traces = [makeTrace("all1"), makeTrace("all2"), makeTrace("all3")]

      let bulkInsertCalled = false

      const layer = createTestLayer({
        traceRepo: {
          listByProjectId: () => Effect.succeed({ items: traces, hasMore: false }),
        },
        itemRepo: {
          bulkInsertIfNotExists: ({ items }) => {
            bulkInsertCalled = true
            return Effect.succeed({ insertedCount: items.length })
          },
        },
      })

      const result = await Effect.runPromise(
        addTracesToQueue({
          projectId: PROJECT_ID,
          queueId: QUEUE_ID,
          selection: { mode: "all" },
        }).pipe(Effect.provide(layer)),
      )

      expect(result.insertedCount).toBe(3)
      expect(bulkInsertCalled).toBe(true)
    })

    it("paginates through all traces when there are multiple pages", async () => {
      const page1Traces = [makeTrace("page1_1"), makeTrace("page1_2")]
      const page2Traces = [makeTrace("page2_1")]

      let callCount = 0

      const layer = createTestLayer({
        traceRepo: {
          listByProjectId: ({ options }) => {
            callCount++
            if (!options?.cursor) {
              return Effect.succeed({
                items: page1Traces,
                hasMore: true,
                nextCursor: { sortValue: "2025-04-01T10:00:00.000Z", traceId: "cursor1" },
              })
            }
            return Effect.succeed({ items: page2Traces, hasMore: false })
          },
        },
        itemRepo: {
          bulkInsertIfNotExists: ({ items }) => Effect.succeed({ insertedCount: items.length }),
        },
      })

      const result = await Effect.runPromise(
        addTracesToQueue({
          projectId: PROJECT_ID,
          queueId: QUEUE_ID,
          selection: { mode: "all" },
        }).pipe(Effect.provide(layer)),
      )

      expect(result.insertedCount).toBe(3)
      expect(callCount).toBe(2)
    })

    it("fails with TooManyTracesSelectedError when all traces exceed limit", async () => {
      const tooManyTraces = Array.from({ length: MAX_TRACES_PER_QUEUE_IMPORT + 1 }, (_, i) => makeTrace(`all${i}`))

      const layer = createTestLayer({
        traceRepo: {
          listByProjectId: () => Effect.succeed({ items: tooManyTraces, hasMore: false }),
        },
      })

      const error = await Effect.runPromise(
        addTracesToQueue({
          projectId: PROJECT_ID,
          queueId: QUEUE_ID,
          selection: { mode: "all" },
        }).pipe(Effect.provide(layer), Effect.flip),
      )

      expect(error).toBeInstanceOf(TooManyTracesSelectedError)
    })
  })

  describe("selection mode: allExcept", () => {
    it("fetches all traces and excludes specified IDs", async () => {
      const allTraces = [makeTrace("keep1"), makeTrace("exclude"), makeTrace("keep2")]

      let insertedItems: Array<{ traceId: TraceId; traceCreatedAt: Date }> = []

      const layer = createTestLayer({
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
        addTracesToQueue({
          projectId: PROJECT_ID,
          queueId: QUEUE_ID,
          selection: { mode: "allExcept", traceIds: [excludeId] },
        }).pipe(Effect.provide(layer)),
      )

      expect(result.insertedCount).toBe(2)
      const insertedTraceIds = insertedItems.map((i) => i.traceId as string)
      expect(insertedTraceIds).not.toContain(excludeId)
    })
  })

  describe("idempotency", () => {
    it("returns 0 when all traces already exist in queue", async () => {
      const traceIds = [TraceId("existing1".padEnd(32, "0")), TraceId("existing2".padEnd(32, "0"))]

      const layer = createTestLayer({
        traceRepo: {
          listByTraceIds: () => Effect.succeed(traceIds.map((id) => makeTraceDetail(id as string))),
        },
        itemRepo: {
          bulkInsertIfNotExists: () => Effect.succeed({ insertedCount: 0 }),
        },
      })

      const result = await Effect.runPromise(
        addTracesToQueue({
          projectId: PROJECT_ID,
          queueId: QUEUE_ID,
          selection: { mode: "selected", traceIds },
        }).pipe(Effect.provide(layer)),
      )

      expect(result.insertedCount).toBe(0)
    })

    it("only counts newly inserted items when some already exist", async () => {
      const traceIds = [TraceId("new1".padEnd(32, "0")), TraceId("existing".padEnd(32, "0"))]

      const layer = createTestLayer({
        traceRepo: {
          listByTraceIds: () => Effect.succeed(traceIds.map((id) => makeTraceDetail(id as string))),
        },
        itemRepo: {
          bulkInsertIfNotExists: () => Effect.succeed({ insertedCount: 1 }),
        },
      })

      const result = await Effect.runPromise(
        addTracesToQueue({
          projectId: PROJECT_ID,
          queueId: QUEUE_ID,
          selection: { mode: "selected", traceIds },
        }).pipe(Effect.provide(layer)),
      )

      expect(result.insertedCount).toBe(1)
    })
  })

  describe("counter updates", () => {
    it("increments totalItems by insertedCount", async () => {
      const traceIds = [TraceId("cnt1".padEnd(32, "0")), TraceId("cnt2".padEnd(32, "0"))]

      let incrementDelta = 0

      const layer = createTestLayer({
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
        addTracesToQueue({
          projectId: PROJECT_ID,
          queueId: QUEUE_ID,
          selection: { mode: "selected", traceIds },
        }).pipe(Effect.provide(layer)),
      )

      expect(incrementDelta).toBe(2)
    })

    it("does not increment counter when insertedCount is 0", async () => {
      let incrementCalled = false

      const layer = createTestLayer({
        traceRepo: {
          listByTraceIds: () => Effect.succeed([makeTraceDetail("existing")]),
        },
        itemRepo: {
          bulkInsertIfNotExists: () => Effect.succeed({ insertedCount: 0 }),
        },
        queueRepo: {
          incrementTotalItems: () => {
            incrementCalled = true
            return Effect.succeed({} as AnnotationQueue)
          },
        },
      })

      await Effect.runPromise(
        addTracesToQueue({
          projectId: PROJECT_ID,
          queueId: QUEUE_ID,
          selection: { mode: "selected", traceIds: [TraceId("existing".padEnd(32, "0"))] },
        }).pipe(Effect.provide(layer)),
      )

      expect(incrementCalled).toBe(false)
    })
  })
})
