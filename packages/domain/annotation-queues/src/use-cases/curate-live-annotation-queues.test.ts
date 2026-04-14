import {
  AnnotationQueueId,
  ExternalUserId,
  OrganizationId,
  ProjectId,
  SessionId,
  SimulationId,
  SpanId,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { LIVE_QUEUE_DEFAULT_SAMPLING } from "../constants.ts"
import type { AnnotationQueue } from "../entities/annotation-queue.ts"
import { AnnotationQueueItemRepository } from "../ports/annotation-queue-item-repository.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"
import { createFakeAnnotationQueueItemRepository } from "../testing/fake-annotation-queue-item-repository.ts"
import { createFakeAnnotationQueueRepository } from "../testing/fake-annotation-queue-repository.ts"
import { curateLiveAnnotationQueuesUseCase } from "./curate-live-annotation-queues.ts"

const INPUT = {
  organizationId: "a".repeat(24),
  projectId: "b".repeat(24),
  traceId: "c".repeat(32),
} as const

function makeTraceDetail(overrides?: Partial<Pick<TraceDetail, "projectId" | "traceId" | "sessionId">>): TraceDetail {
  return {
    organizationId: OrganizationId(INPUT.organizationId),
    projectId: overrides?.projectId ?? ProjectId(INPUT.projectId),
    traceId: overrides?.traceId ?? TraceId(INPUT.traceId),
    spanCount: 3,
    errorCount: 0,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    endTime: new Date("2026-01-01T00:00:01.000Z"),
    durationNs: 1,
    timeToFirstTokenNs: 0,
    tokensInput: 120,
    tokensOutput: 80,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    tokensTotal: 200,
    costInputMicrocents: 50,
    costOutputMicrocents: 25,
    costTotalMicrocents: 75,
    sessionId: overrides?.sessionId ?? SessionId("session"),
    userId: ExternalUserId("user"),
    simulationId: SimulationId(""),
    tags: [],
    metadata: {},
    models: ["gpt-4o-mini"],
    providers: ["openai"],
    serviceNames: ["web"],
    rootSpanId: SpanId("r".repeat(16)),
    rootSpanName: "root",
    systemInstructions: [{ type: "text", text: "You are a careful assistant." }],
    inputMessages: [],
    outputMessages: [],
    allMessages: [],
  }
}

function makeLiveQueue(id: string, overrides?: Partial<AnnotationQueue>): AnnotationQueue {
  return {
    id: AnnotationQueueId(id),
    organizationId: OrganizationId(INPUT.organizationId),
    projectId: ProjectId(INPUT.projectId),
    system: false,
    name: `Live Queue ${id.slice(-4)}`,
    slug: `live-queue-${id.slice(-4)}`,
    description: "A live queue",
    instructions: "Review traces",
    settings: {
      filter: { tags: [{ op: "contains", value: "test" }] },
      sampling: LIVE_QUEUE_DEFAULT_SAMPLING,
    },
    assignees: [],
    totalItems: 0,
    completedItems: 0,
    deletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  }
}

const fakeSqlClient = createFakeSqlClient()

describe("curateLiveAnnotationQueuesUseCase", () => {
  it("skips when trace is not found", async () => {
    const { repository: traceRepo } = createFakeTraceRepository()
    const { repository: queueRepo } = createFakeAnnotationQueueRepository()
    const { repository: itemRepo } = createFakeAnnotationQueueItemRepository()

    const result = await Effect.runPromise(
      curateLiveAnnotationQueuesUseCase(INPUT).pipe(
        Effect.provideService(SqlClient, fakeSqlClient),
        Effect.provideService(TraceRepository, traceRepo),
        Effect.provideService(AnnotationQueueRepository, queueRepo),
        Effect.provideService(AnnotationQueueItemRepository, itemRepo),
      ),
    )

    expect(result.action).toBe("skipped")
    if (result.action === "skipped") {
      expect(result.reason).toBe("trace-not-found")
    }
  })

  it("completes with zero counts when no live queues exist", async () => {
    const traceDetail = makeTraceDetail()
    const { repository: traceRepo } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(traceDetail),
    })
    const { repository: queueRepo } = createFakeAnnotationQueueRepository()
    const { repository: itemRepo } = createFakeAnnotationQueueItemRepository()

    const result = await Effect.runPromise(
      curateLiveAnnotationQueuesUseCase(INPUT).pipe(
        Effect.provideService(SqlClient, fakeSqlClient),
        Effect.provideService(TraceRepository, traceRepo),
        Effect.provideService(AnnotationQueueRepository, queueRepo),
        Effect.provideService(AnnotationQueueItemRepository, itemRepo),
      ),
    )

    expect(result.action).toBe("completed")
    if (result.action === "completed") {
      expect(result.summary.liveQueuesScanned).toBe(0)
      expect(result.summary.filterMatchedCount).toBe(0)
      expect(result.summary.insertedItemCount).toBe(0)
    }
  })

  it("inserts queue items for filter-matched and sampled queues", async () => {
    const traceDetail = makeTraceDetail()
    const queue1 = makeLiveQueue("q".repeat(24), {
      settings: { filter: { tags: [{ op: "eq", value: "match" }] }, sampling: 100 },
    })
    const queue2 = makeLiveQueue("r".repeat(24), {
      settings: { filter: { tags: [{ op: "eq", value: "nomatch" }] }, sampling: 100 },
    })

    const { repository: traceRepo } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(traceDetail),
      listMatchingFilterIdsByTraceId: ({ filterSets }) => {
        const matchingIds = filterSets.filter((fs) => fs.filterId === queue1.id).map((fs) => fs.filterId)
        return Effect.succeed(matchingIds)
      },
    })
    const { repository: queueRepo } = createFakeAnnotationQueueRepository([queue1, queue2])
    const { repository: itemRepo, items } = createFakeAnnotationQueueItemRepository()

    const result = await Effect.runPromise(
      curateLiveAnnotationQueuesUseCase(INPUT).pipe(
        Effect.provideService(SqlClient, fakeSqlClient),
        Effect.provideService(TraceRepository, traceRepo),
        Effect.provideService(AnnotationQueueRepository, queueRepo),
        Effect.provideService(AnnotationQueueItemRepository, itemRepo),
      ),
    )

    expect(result.action).toBe("completed")
    if (result.action === "completed") {
      expect(result.summary.liveQueuesScanned).toBe(2)
      expect(result.summary.filterMatchedCount).toBe(1)
      expect(result.summary.insertedItemCount).toBe(1)
    }

    expect(items.size).toBe(1)
    const insertedItem = [...items.values()][0]
    expect(insertedItem?.queueId).toBe(queue1.id)
    expect(insertedItem?.traceId).toBe(traceDetail.traceId)
  })

  it("skips queues that fail sampling", async () => {
    const traceDetail = makeTraceDetail()
    const queue = makeLiveQueue("q".repeat(24), {
      settings: { filter: { tags: [{ op: "eq", value: "match" }] }, sampling: 0 },
    })

    const { repository: traceRepo } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(traceDetail),
      listMatchingFilterIdsByTraceId: () => Effect.succeed([queue.id]),
    })
    const { repository: queueRepo } = createFakeAnnotationQueueRepository([queue])
    const { repository: itemRepo, items } = createFakeAnnotationQueueItemRepository()

    const result = await Effect.runPromise(
      curateLiveAnnotationQueuesUseCase(INPUT).pipe(
        Effect.provideService(SqlClient, fakeSqlClient),
        Effect.provideService(TraceRepository, traceRepo),
        Effect.provideService(AnnotationQueueRepository, queueRepo),
        Effect.provideService(AnnotationQueueItemRepository, itemRepo),
      ),
    )

    expect(result.action).toBe("completed")
    if (result.action === "completed") {
      expect(result.summary.filterMatchedCount).toBe(1)
      expect(result.summary.skippedSamplingCount).toBe(1)
      expect(result.summary.insertedItemCount).toBe(0)
    }

    expect(items.size).toBe(0)
  })

  it("does not duplicate items for the same trace", async () => {
    const traceDetail = makeTraceDetail()
    const queue = makeLiveQueue("q".repeat(24), {
      settings: { filter: { tags: [{ op: "eq", value: "match" }] }, sampling: 100 },
    })

    const { repository: traceRepo } = createFakeTraceRepository({
      findByTraceId: () => Effect.succeed(traceDetail),
      listMatchingFilterIdsByTraceId: () => Effect.succeed([queue.id]),
    })
    const { repository: queueRepo } = createFakeAnnotationQueueRepository([queue])
    const { repository: itemRepo, items } = createFakeAnnotationQueueItemRepository()

    await Effect.runPromise(
      curateLiveAnnotationQueuesUseCase(INPUT).pipe(
        Effect.provideService(SqlClient, fakeSqlClient),
        Effect.provideService(TraceRepository, traceRepo),
        Effect.provideService(AnnotationQueueRepository, queueRepo),
        Effect.provideService(AnnotationQueueItemRepository, itemRepo),
      ),
    )

    expect(items.size).toBe(1)

    const result2 = await Effect.runPromise(
      curateLiveAnnotationQueuesUseCase(INPUT).pipe(
        Effect.provideService(SqlClient, fakeSqlClient),
        Effect.provideService(TraceRepository, traceRepo),
        Effect.provideService(AnnotationQueueRepository, queueRepo),
        Effect.provideService(AnnotationQueueItemRepository, itemRepo),
      ),
    )

    expect(items.size).toBe(1)
    if (result2.action === "completed") {
      expect(result2.summary.insertedItemCount).toBe(0)
    }
  })
})
