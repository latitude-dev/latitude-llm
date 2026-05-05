import type { RunLiveEvaluationResult } from "@domain/evaluations"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import type { RedisClient } from "@platform/cache-redis"
import { setupTestClickHouse, setupTestPostgres } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"

import { createMockLogger, TestQueueConsumer } from "../testing/index.ts"
import { createLiveEvaluationsWorker } from "./live-evaluations.ts"

const pg = setupTestPostgres()
const ch = setupTestClickHouse()
const DUMMY_REDIS = {} as RedisClient

const PAYLOAD = {
  organizationId: "o".repeat(24),
  projectId: "p".repeat(24),
  evaluationId: "e".repeat(24),
  traceId: "t".repeat(32),
} as const

describe("createLiveEvaluationsWorker execute path", () => {
  it("registers only the execute task", () => {
    const consumer = new TestQueueConsumer()
    const queue = createFakeQueuePublisher()

    createLiveEvaluationsWorker({
      consumer,
      postgresClient: pg.appPostgresClient,
      clickhouseClient: ch.client,
      redisClient: DUMMY_REDIS,
      publisher: queue.publisher,
    })

    expect(consumer.getRegisteredTasks("live-evaluations")).toEqual(["execute"])
  })

  it("logs skipped execute results", async () => {
    const consumer = new TestQueueConsumer()
    const queue = createFakeQueuePublisher()
    const log = createMockLogger()
    const runLiveEvaluation = vi.fn(
      (): Effect.Effect<RunLiveEvaluationResult> =>
        Effect.succeed({
          action: "skipped",
          reason: "trace-not-found",
          evaluationId: PAYLOAD.evaluationId,
          traceId: PAYLOAD.traceId,
        }),
    )

    createLiveEvaluationsWorker({
      consumer,
      postgresClient: pg.appPostgresClient,
      clickhouseClient: ch.client,
      redisClient: DUMMY_REDIS,
      publisher: queue.publisher,
      runLiveEvaluation,
      logger: log,
    })

    await consumer.dispatchTask("live-evaluations", "execute", PAYLOAD)

    expect(runLiveEvaluation).toHaveBeenCalledWith(
      PAYLOAD,
      expect.objectContaining({
        beforeExecute: expect.any(Function),
      }),
    )
    expect(log.info).toHaveBeenCalledWith("Live evaluation execute skipped", {
      queue: "live-evaluations",
      task: "execute",
      organizationId: PAYLOAD.organizationId,
      projectId: PAYLOAD.projectId,
      evaluationId: PAYLOAD.evaluationId,
      traceId: PAYLOAD.traceId,
      outcome: "skipped",
      resultKind: "skipped",
      reason: "trace-not-found",
    })
  })
})
