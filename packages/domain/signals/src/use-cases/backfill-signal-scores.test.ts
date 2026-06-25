import { type Evaluation, EvaluationRepository } from "@domain/evaluations"
import { QueuePublisher } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { ChSqlClient, OrganizationId, SqlClient, type SqlClientShape } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { type Trace, TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { backfillSignalScoresUseCase } from "./backfill-signal-scores.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const evaluationId = "eeeeeeeeeeeeeeeeeeeeeeee"

const stubSqlClient: SqlClientShape = {
  organizationId: OrganizationId(organizationId),
  transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, stubSqlClient)),
  query: () => Effect.die("Unexpected direct SQL query in unit test"),
}

const makeEvaluation = (script: string): Evaluation =>
  ({ id: evaluationId, script, archivedAt: null, deletedAt: null }) as unknown as Evaluation

const makeTrace = (traceId: string, startTime: Date, simulationId = ""): Trace =>
  ({ traceId, startTime, simulationId }) as unknown as Trace

const buildLayer = (evaluation: Evaluation, traces: readonly Trace[]) => {
  const queue = createFakeQueuePublisher()
  const evaluationRepository = EvaluationRepository.of({
    findById: () => Effect.succeed(evaluation),
    save: () => Effect.void,
    listByProjectId: () => Effect.succeed({ items: [], hasMore: false, limit: 100, offset: 0 }),
    listBySignalId: () => Effect.succeed({ items: [], hasMore: false, limit: 100, offset: 0 }),
    listBySignalIds: () => Effect.succeed({ items: [], hasMore: false, limit: 100, offset: 0 }),
    archive: () => Effect.void,
    unarchive: () => Effect.void,
    softDelete: () => Effect.void,
    softDeleteBySignalId: () => Effect.void,
  })
  const { repository: traceRepository } = createFakeTraceRepository({
    listByProjectId: () => Effect.succeed({ items: traces, hasMore: false }),
  })
  const layer = Layer.mergeAll(
    Layer.succeed(EvaluationRepository, evaluationRepository),
    Layer.succeed(TraceRepository, traceRepository),
    Layer.succeed(QueuePublisher, queue.publisher),
    Layer.succeed(SqlClient, stubSqlClient),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(organizationId) })),
  )
  return { layer, queue }
}

const baseInput = {
  organizationId,
  projectId,
  signalId: "ssssssssssssssssssssssss",
  evaluationId,
  windowStartIso: "2026-06-01T00:00:00.000Z",
}

describe("backfillSignalScoresUseCase", () => {
  it("fans out in-window non-sandbox traces and stops at the window boundary", async () => {
    const evaluation = makeEvaluation("return Passed(1, 'ok')")
    const traces = [
      makeTrace("t1", new Date("2026-06-10T00:00:00Z")),
      makeTrace("t2", new Date("2026-06-09T00:00:00Z"), "sim-1"), // sandbox → skipped
      makeTrace("t3", new Date("2026-06-08T00:00:00Z")),
      makeTrace("t4", new Date("2026-05-20T00:00:00Z")), // older than window → stop
      makeTrace("t5", new Date("2026-05-19T00:00:00Z")),
    ]
    const { layer, queue } = buildLayer(evaluation, traces)

    const result = await Effect.runPromise(backfillSignalScoresUseCase(baseInput).pipe(Effect.provide(layer)))

    const executed = queue.published.filter((m) => m.queue === "live-evaluations" && m.task === "execute")
    expect(executed.map((m) => (m.payload as { traceId: string }).traceId)).toEqual(["t1", "t3"])
    expect(result.publishedCount).toBe(2)
    expect(result.done).toBe(true)
    expect(result.nextCursor).toBeNull()
  })

  it("skips a judge evaluation entirely (judges collect forward)", async () => {
    const evaluation = makeEvaluation("const r = await llm(`x`, { schema: z.object({ passed: z.boolean() }) })")
    const { layer, queue } = buildLayer(evaluation, [makeTrace("t1", new Date("2026-06-10T00:00:00Z"))])

    const result = await Effect.runPromise(backfillSignalScoresUseCase(baseInput).pipe(Effect.provide(layer)))

    expect(result.publishedCount).toBe(0)
    expect(result.done).toBe(true)
    expect(queue.published.length).toBe(0)
  })
})
