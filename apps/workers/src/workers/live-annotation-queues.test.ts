import type { CurateLiveAnnotationQueuesInput, CurateLiveAnnotationQueuesResult } from "@domain/annotation-queues"
import { AnnotationQueueItemRepository, AnnotationQueueRepository } from "@domain/annotation-queues"
import { RepositoryError } from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import type { PostgresClient } from "@platform/db-postgres"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { createMockLogger, TestQueueConsumer } from "../testing/index.ts"
import { type CuratePayload, createCurateHandler, createLiveAnnotationQueuesWorker } from "./live-annotation-queues.ts"

const PAYLOAD: CuratePayload = {
  organizationId: "o".repeat(24),
  projectId: "p".repeat(24),
  traceId: "t".repeat(32),
}

const createNoopRepositoryLayers = () =>
  Layer.mergeAll(
    Layer.succeed(AnnotationQueueRepository, {} as AnnotationQueueRepository["Service"]),
    Layer.succeed(AnnotationQueueItemRepository, {} as AnnotationQueueItemRepository["Service"]),
    Layer.succeed(TraceRepository, {} as TraceRepository["Service"]),
  )

describe("createLiveAnnotationQueuesWorker", () => {
  it("registers the live-annotation-queues queue", () => {
    const consumer = new TestQueueConsumer()

    createLiveAnnotationQueuesWorker({
      consumer,
      postgresClient: {} as PostgresClient,
      clickhouseClient: {} as ClickHouseClient,
    })

    expect(consumer.getRegisteredQueues()).toContain("live-annotation-queues")
  })

  it("registers the curate task handler", () => {
    const consumer = new TestQueueConsumer()

    createLiveAnnotationQueuesWorker({
      consumer,
      postgresClient: {} as PostgresClient,
      clickhouseClient: {} as ClickHouseClient,
    })

    expect(consumer.getRegisteredTasks("live-annotation-queues")).toContain("curate")
  })
})

describe("createCurateHandler", () => {
  it("calls the use case with the payload", async () => {
    const useCaseCalls: CurateLiveAnnotationQueuesInput[] = []
    const mockUseCase = (input: CurateLiveAnnotationQueuesInput) => {
      useCaseCalls.push(input)
      return Effect.succeed({
        action: "completed",
        summary: {
          traceId: input.traceId,
          liveQueuesScanned: 0,
          filterMatchedCount: 0,
          skippedSamplingCount: 0,
          insertedItemCount: 0,
        },
      } satisfies CurateLiveAnnotationQueuesResult)
    }

    const handler = createCurateHandler({
      useCase: mockUseCase,
      postgresClient: {} as PostgresClient,
      clickhouseClient: {} as ClickHouseClient,
      log: createMockLogger(),
    })

    await Effect.runPromise(handler(PAYLOAD).pipe(Effect.provide(createNoopRepositoryLayers())))

    expect(useCaseCalls).toHaveLength(1)
    expect(useCaseCalls[0]).toEqual(PAYLOAD)
  })

  it("logs info when curate completes successfully", async () => {
    const log = createMockLogger()
    const mockUseCase = () =>
      Effect.succeed({
        action: "completed",
        summary: {
          traceId: PAYLOAD.traceId,
          liveQueuesScanned: 5,
          filterMatchedCount: 3,
          skippedSamplingCount: 1,
          insertedItemCount: 2,
        },
      } satisfies CurateLiveAnnotationQueuesResult)

    const handler = createCurateHandler({
      useCase: mockUseCase,
      postgresClient: {} as PostgresClient,
      clickhouseClient: {} as ClickHouseClient,
      log,
    })

    await Effect.runPromise(handler(PAYLOAD).pipe(Effect.provide(createNoopRepositoryLayers())))

    expect(log.info).toHaveBeenCalledWith("Live annotation queue curate completed", {
      queue: "live-annotation-queues",
      task: "curate",
      organizationId: PAYLOAD.organizationId,
      projectId: PAYLOAD.projectId,
      traceId: PAYLOAD.traceId,
      outcome: "completed",
      liveQueuesScanned: 5,
      filterMatchedCount: 3,
      skippedSamplingCount: 1,
      insertedItemCount: 2,
    })
  })

  it("logs info when curate skips due to trace not found", async () => {
    const log = createMockLogger()
    const mockUseCase = () =>
      Effect.succeed({
        action: "skipped",
        reason: "trace-not-found",
        traceId: PAYLOAD.traceId,
      } satisfies CurateLiveAnnotationQueuesResult)

    const handler = createCurateHandler({
      useCase: mockUseCase,
      postgresClient: {} as PostgresClient,
      clickhouseClient: {} as ClickHouseClient,
      log,
    })

    await Effect.runPromise(handler(PAYLOAD).pipe(Effect.provide(createNoopRepositoryLayers())))

    expect(log.info).toHaveBeenCalledWith("Live annotation queue curate skipped", {
      queue: "live-annotation-queues",
      task: "curate",
      organizationId: PAYLOAD.organizationId,
      projectId: PAYLOAD.projectId,
      traceId: PAYLOAD.traceId,
      outcome: "skipped",
      reason: "trace-not-found",
    })
  })

  it("logs error when curate fails", async () => {
    const log = createMockLogger()
    const testError = new RepositoryError({ operation: "test", cause: "DB connection failed" })
    const mockUseCase = () => Effect.fail(testError)

    const handler = createCurateHandler({
      useCase: mockUseCase,
      postgresClient: {} as PostgresClient,
      clickhouseClient: {} as ClickHouseClient,
      log,
    })

    await Effect.runPromise(handler(PAYLOAD).pipe(Effect.provide(createNoopRepositoryLayers()), Effect.ignore))

    expect(log.error).toHaveBeenCalledWith("Live annotation queue curate failed", {
      queue: "live-annotation-queues",
      task: "curate",
      organizationId: PAYLOAD.organizationId,
      projectId: PAYLOAD.projectId,
      traceId: PAYLOAD.traceId,
      outcome: "failed",
      error: testError,
    })
  })
})
