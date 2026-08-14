import { createFakeScoreRepository } from "@domain/scores/testing"
import { OrganizationId, ProjectId, ScoreId, SqlClient, TraceId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { scoreSchema } from "../entities/score.ts"
import { ScoreRepository } from "../ports/score-repository.ts"
import { listScoresByTraceIdsUseCase, listTraceScoresUseCase } from "./list-trace-scores.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const traceId = TraceId("t".repeat(32))
const otherTraceId = TraceId("u".repeat(32))

const makeScore = (overrides: Record<string, unknown> = {}) =>
  scoreSchema.parse({
    id: ScoreId("s".repeat(24)),
    organizationId: organizationId as string,
    projectId,
    sessionId: null,
    traceId,
    spanId: null,
    simulationId: null,
    signalId: null,
    sourceType: "custom",
    sourceId: "api-pipeline",
    value: 0.2,
    passed: false,
    feedback: "Wrong answer",
    metadata: {},
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    annotatorId: null,
    createdAt: new Date("2026-03-31T00:00:00.000Z"),
    updatedAt: new Date("2026-03-31T00:00:00.000Z"),
    ...overrides,
  })

const listScoresForTraces = (scores: Map<string, ReturnType<typeof makeScore>>, traceIds: readonly TraceId[]) => {
  const traceIdSet = new Set(traceIds.map(String))
  const items = [...scores.values()].filter(
    (score) => score.projectId === projectId && score.traceId !== null && traceIdSet.has(String(score.traceId)),
  )
  return { items, hasMore: false, limit: 50, offset: 0 }
}

const provideTestServices =
  (repository: ReturnType<typeof createFakeScoreRepository>["repository"]) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(ScoreRepository, repository),
      Effect.provideService(SqlClient, createFakeSqlClient({ organizationId })),
    )

describe("listTraceScoresUseCase", () => {
  it("returns every score source for a trace", async () => {
    const custom = makeScore({ id: ScoreId("a".repeat(24)), sourceType: "custom", sourceId: "api" })
    const evaluation = makeScore({
      id: ScoreId("b".repeat(24)),
      sourceType: "evaluation",
      sourceId: "e".repeat(24),
      metadata: { evaluationHash: "hash" },
      passed: true,
    })
    const annotation = makeScore({
      id: ScoreId("c".repeat(24)),
      sourceType: "annotation",
      sourceId: "UI",
      metadata: { rawFeedback: "note" },
    })

    const { repository, scores } = createFakeScoreRepository({
      listByTraceId: ({ traceId: requestedTraceId }) => Effect.succeed(listScoresForTraces(scores, [requestedTraceId])),
    })
    scores.set(custom.id, custom)
    scores.set(evaluation.id, evaluation)
    scores.set(annotation.id, annotation)

    const page = await Effect.runPromise(
      listTraceScoresUseCase({ projectId, traceId }).pipe(provideTestServices(repository)),
    )

    expect(page.items).toHaveLength(3)
    expect(page.items.map((score) => score.sourceType).sort()).toEqual(["annotation", "custom", "evaluation"])
  })

  it("forwards omitAbsentEvaluations to the repository", async () => {
    let receivedOmitAbsentEvaluations: boolean | undefined
    const { repository } = createFakeScoreRepository({
      listByTraceId: ({ options }) => {
        receivedOmitAbsentEvaluations = options?.omitAbsentEvaluations
        return Effect.succeed({ items: [], hasMore: false, limit: 50, offset: 0 })
      },
    })

    await Effect.runPromise(
      listTraceScoresUseCase({ projectId, traceId, omitAbsentEvaluations: true }).pipe(provideTestServices(repository)),
    )

    expect(receivedOmitAbsentEvaluations).toBe(true)
  })
})

describe("listScoresByTraceIdsUseCase", () => {
  it("returns scores across multiple traces without filtering by source", async () => {
    const onFirstTrace = makeScore({ id: ScoreId("a".repeat(24)), traceId })
    const onSecondTrace = makeScore({
      id: ScoreId("b".repeat(24)),
      traceId: otherTraceId,
      sourceType: "evaluation",
      sourceId: "e".repeat(24),
      metadata: { evaluationHash: "hash" },
      passed: true,
    })

    const { repository, scores } = createFakeScoreRepository({
      listByTraceIds: ({ traceIds }) => Effect.succeed(listScoresForTraces(scores, traceIds)),
    })
    scores.set(onFirstTrace.id, onFirstTrace)
    scores.set(onSecondTrace.id, onSecondTrace)

    const page = await Effect.runPromise(
      listScoresByTraceIdsUseCase({ projectId, traceIds: [traceId, otherTraceId] }).pipe(
        provideTestServices(repository),
      ),
    )

    expect(page.items).toHaveLength(2)
  })
})
