import type { QueueConsumer, QueueName, TaskHandlers } from "@domain/queue"
import { ScoreEventWriter, writeScoreUseCase } from "@domain/scores"
import { OrganizationId, ProjectId, ScoreId } from "@domain/shared"
import { queryClickhouse } from "@platform/db-clickhouse"
import { ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { setupTestClickHouse, setupTestPostgres } from "@platform/testkit"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { createScoresWorker } from "./scores.ts"

type AnyTaskHandlers = Record<string, (payload: unknown) => Effect.Effect<void, unknown>>

class TestQueueConsumer implements QueueConsumer {
  private readonly registered = new Map<QueueName, AnyTaskHandlers>()

  subscribe<T extends QueueName>(queue: T, handlers: TaskHandlers<T>): void {
    this.registered.set(queue, handlers as unknown as AnyTaskHandlers)
  }

  start() {
    return Effect.void
  }

  stop() {
    return Effect.void
  }

  async dispatchTask(queue: QueueName, task: string, payload: unknown): Promise<void> {
    const handlers = this.registered.get(queue)
    if (!handlers) throw new Error(`No handlers registered for queue ${queue}`)
    const handler = handlers[task]
    if (!handler) throw new Error(`No handler for task ${task} on queue ${queue}`)
    await Effect.runPromise(handler(payload))
  }
}

const pg = setupTestPostgres()
const ch = setupTestClickHouse()

const scoreEventWriterLayer = Layer.succeed(ScoreEventWriter, {
  scoreImmutable: () => Effect.void,
})

const writeScore = (organizationId: string, input: Parameters<typeof writeScoreUseCase>[0]) =>
  Effect.runPromise(
    writeScoreUseCase(input).pipe(
      withPostgres(
        Layer.mergeAll(ScoreRepositoryLive, scoreEventWriterLayer),
        pg.appPostgresClient,
        OrganizationId(organizationId),
      ),
    ),
  )

const queryAnalyticsScores = (organizationId: string, scoreId: string) =>
  Effect.runPromise(
    queryClickhouse<{ id: string; source_id: string }>(
      ch.client,
      `SELECT id, source_id
       FROM scores
       WHERE organization_id = {organizationId:String}
         AND id = {scoreId:FixedString(24)}`,
      { organizationId, scoreId },
    ),
  ).then((rows) =>
    rows.map((row) => ({
      ...row,
      source_id: row.source_id.replace(/\0+$/u, ""),
    })),
  )

describe("createScoresWorker", () => {
  it("stores immutable scores in analytics once even when the same save task is retried", async () => {
    const organizationId = "pppppppppppppppppppppppp"
    const projectId = ProjectId("qqqqqqqqqqqqqqqqqqqqqqqq")
    const consumer = new TestQueueConsumer()

    createScoresWorker(consumer, {
      postgresClient: pg.appPostgresClient,
      clickhouseClient: ch.client,
      logger: { info: () => undefined, error: () => undefined },
    })

    const score = await writeScore(organizationId, {
      id: ScoreId("rrrrrrrrrrrrrrrrrrrrrrrr"),
      projectId,
      source: "custom",
      sourceId: "api-source",
      value: 0.91,
      passed: true,
      feedback: "Analytics custom score",
      metadata: { channel: "api" },
      sessionId: "analytics-session",
      traceId: "11111111111111111111111111111111",
      spanId: "aaaaaaaaaaaaaaaa",
    })

    const savePayload = {
      organizationId,
      projectId: projectId as string,
      scoreId: score.id,
    }

    await consumer.dispatchTask("analytic-scores", "save", savePayload)
    await consumer.dispatchTask("analytic-scores", "save", savePayload)

    const analyticsRows = await queryAnalyticsScores(organizationId, score.id as string)

    expect(analyticsRows).toHaveLength(1)
    expect(analyticsRows[0]?.source_id).toBe("api-source")
  })

  it("skips non-immutable scores after re-fetching current Postgres state", async () => {
    const organizationId = "mmmmmmmmmmmmmmmmmmmmmmmm"
    const projectId = ProjectId("nnnnnnnnnnnnnnnnnnnnnnnn")
    const consumer = new TestQueueConsumer()

    createScoresWorker(consumer, {
      postgresClient: pg.appPostgresClient,
      clickhouseClient: ch.client,
      logger: { info: () => undefined, error: () => undefined },
    })

    const draftScore = await writeScore(organizationId, {
      id: ScoreId("dddddddddddddddddddddddd"),
      projectId,
      source: "annotation",
      sourceId: "UI",
      value: 0.2,
      passed: false,
      feedback: "Still drafting",
      metadata: { rawFeedback: "Still drafting" },
      draftedAt: new Date("2026-03-24T18:05:00.000Z"),
    })

    await consumer.dispatchTask("analytic-scores", "save", {
      organizationId,
      projectId: projectId as string,
      scoreId: draftScore.id,
    })

    const analyticsRows = await queryAnalyticsScores(organizationId, draftScore.id as string)

    expect(analyticsRows).toHaveLength(0)
  })
})
