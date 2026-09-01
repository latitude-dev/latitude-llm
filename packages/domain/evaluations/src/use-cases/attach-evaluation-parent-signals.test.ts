import { scoreSchema } from "@domain/scores"
import {
  EvaluationId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  ScoreId,
  SignalId,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { defaultEvaluationTrigger, type Evaluation, emptyEvaluationAlignment } from "../entities/evaluation.ts"
import { EvaluationRepository, type EvaluationRepositoryShape } from "../ports/evaluation-repository.ts"
import { attachEvaluationParentSignalsUseCase } from "./attach-evaluation-parent-signals.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const signalId = SignalId("i".repeat(24))
const evaluationId = EvaluationId("e".repeat(24))
const traceId = TraceId("t".repeat(32))

const makeEvaluation = (overrides: Partial<Evaluation> = {}): Evaluation =>
  ({
    id: evaluationId,
    organizationId,
    projectId,
    signalId,
    name: "Eval",
    description: "Generated description",
    script: "return { passed: false }",
    trigger: defaultEvaluationTrigger(),
    alignment: emptyEvaluationAlignment("hash-1"),
    alignedAt: new Date("2026-04-01T00:00:00.000Z"),
    archivedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    ...overrides,
  }) as Evaluation

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

const unused = () => Effect.die("Unexpected EvaluationRepository call")

const createEvaluationRepository = (evaluations: readonly Evaluation[]) => {
  const findByIdCalls: string[] = []
  const byId = new Map(evaluations.map((evaluation) => [String(evaluation.id), evaluation]))
  const repository: EvaluationRepositoryShape = {
    findById: (id) =>
      Effect.gen(function* () {
        findByIdCalls.push(id)
        const evaluation = byId.get(id)
        if (!evaluation) return yield* new NotFoundError({ entity: "Evaluation", id })
        return evaluation
      }),
    save: unused,
    listByProjectId: unused,
    listBySignalId: unused,
    listBySignalIds: unused,
    archive: unused,
    unarchive: unused,
    softDelete: unused,
    softDeleteBySignalId: unused,
  }
  return { repository, findByIdCalls }
}

const provide = (repository: EvaluationRepositoryShape) =>
  Layer.mergeAll(
    Layer.succeed(EvaluationRepository, repository),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
  )

describe("attachEvaluationParentSignalsUseCase", () => {
  it("attaches the evaluation's parent signal to evaluation scores", async () => {
    const evaluation = makeEvaluation()
    const score = makeScore({
      sourceType: "evaluation",
      sourceId: evaluationId,
      metadata: { evaluationHash: "hash-1" },
    })
    const { repository, findByIdCalls } = createEvaluationRepository([evaluation])

    const page = await Effect.runPromise(
      attachEvaluationParentSignalsUseCase({
        items: [score],
        hasMore: false,
        limit: 50,
        offset: 0,
      }).pipe(Effect.provide(provide(repository))),
    )

    expect(page.items[0]?.evaluationSignalId).toBe(signalId)
    expect(findByIdCalls).toEqual([evaluationId])
  })

  it("leaves evaluationSignalId null when the evaluation is missing", async () => {
    const score = makeScore({
      sourceType: "evaluation",
      sourceId: evaluationId,
      metadata: { evaluationHash: "hash-1" },
    })
    const { repository } = createEvaluationRepository([])

    const page = await Effect.runPromise(
      attachEvaluationParentSignalsUseCase({
        items: [score],
        hasMore: false,
        limit: 50,
        offset: 0,
      }).pipe(Effect.provide(provide(repository))),
    )

    expect(page.items[0]?.evaluationSignalId).toBeNull()
  })

  it("does not look up evaluations for annotation or custom scores", async () => {
    const custom = makeScore()
    const annotation = makeScore({
      id: ScoreId("a".repeat(24)),
      sourceType: "annotation",
      sourceId: "UI",
      metadata: { rawFeedback: "note" },
    })
    const { repository, findByIdCalls } = createEvaluationRepository([makeEvaluation()])

    const page = await Effect.runPromise(
      attachEvaluationParentSignalsUseCase({
        items: [custom, annotation],
        hasMore: false,
        limit: 50,
        offset: 0,
      }).pipe(Effect.provide(provide(repository))),
    )

    expect(findByIdCalls).toEqual([])
    expect(page.items.map((item) => item.evaluationSignalId)).toEqual([null, null])
  })

  it("looks up each evaluation id once when several scores share it", async () => {
    const first = makeScore({
      sourceType: "evaluation",
      sourceId: evaluationId,
      metadata: { evaluationHash: "hash-1" },
    })
    const second = makeScore({
      id: ScoreId("b".repeat(24)),
      sourceType: "evaluation",
      sourceId: evaluationId,
      metadata: { evaluationHash: "hash-1" },
      passed: true,
      signalId,
    })
    const { repository, findByIdCalls } = createEvaluationRepository([makeEvaluation()])

    const page = await Effect.runPromise(
      attachEvaluationParentSignalsUseCase({
        items: [first, second],
        hasMore: true,
        limit: 50,
        offset: 0,
      }).pipe(Effect.provide(provide(repository))),
    )

    expect(findByIdCalls).toEqual([evaluationId])
    expect(page.items.map((item) => item.evaluationSignalId)).toEqual([signalId, signalId])
    expect(page.hasMore).toBe(true)
  })
})
