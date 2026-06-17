import { WorkflowQuerier, type WorkflowQuerierShape } from "@domain/queue"
import { EvaluationId, SignalId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { defaultEvaluationTrigger, type Evaluation, emptyEvaluationAlignment } from "../entities/evaluation.ts"
import { EvaluationRepository, type EvaluationRepositoryShape } from "../ports/evaluation-repository.ts"
import { deriveSignalAlignmentState, getSignalAlignmentStateUseCase } from "./get-issue-alignment-state.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const signalId = SignalId("i".repeat(24))
const evaluationId = EvaluationId("e".repeat(24))

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

const provideWorkflowQuerier = (running: ReadonlySet<string> = new Set()) => {
  const querier: WorkflowQuerierShape = {
    describe: (workflowId) =>
      Effect.sync(() =>
        running.has(workflowId)
          ? {
              status: "running",
              runId: "run-1",
              startTime: new Date("2026-04-01T00:00:00.000Z"),
              closeTime: null,
            }
          : null,
      ),
    query: () => Effect.die("Unexpected query"),
  }
  return Layer.succeed(WorkflowQuerier, querier)
}

describe("deriveSignalAlignmentState", () => {
  it("returns `automatic` when the issue is auto-monitored and has no active evaluations", async () => {
    const state = await Effect.runPromise(
      deriveSignalAlignmentState({
        signalId,
        activeEvaluations: [],
        isAutomaticallyMonitored: true,
      }).pipe(Effect.provide(provideWorkflowQuerier())),
    )

    expect(state).toEqual({ kind: "automatic" })
  })

  it("returns `idle` when no workflow is running and no active evaluations exist", async () => {
    const state = await Effect.runPromise(
      deriveSignalAlignmentState({ signalId, activeEvaluations: [] }).pipe(Effect.provide(provideWorkflowQuerier())),
    )

    expect(state).toEqual({ kind: "idle" })
  })

  it("returns `generating` when the per-issue generation workflow is running", async () => {
    const state = await Effect.runPromise(
      deriveSignalAlignmentState({ signalId, activeEvaluations: [] }).pipe(
        Effect.provide(provideWorkflowQuerier(new Set([`evaluations:generate:${signalId}`]))),
      ),
    )

    expect(state).toEqual({ kind: "generating" })
  })

  it("returns `realigning` when an optimization workflow is running for an active evaluation", async () => {
    const evaluation = makeEvaluation()
    const state = await Effect.runPromise(
      deriveSignalAlignmentState({ signalId, activeEvaluations: [evaluation] }).pipe(
        Effect.provide(provideWorkflowQuerier(new Set([`evaluations:optimize:${evaluation.id}`]))),
      ),
    )

    expect(state).toEqual({ kind: "realigning", evaluationId: evaluation.id })
  })

  it("returns `realigning` when a refresh-alignment workflow is running for an active evaluation", async () => {
    const evaluation = makeEvaluation()
    const state = await Effect.runPromise(
      deriveSignalAlignmentState({ signalId, activeEvaluations: [evaluation] }).pipe(
        Effect.provide(provideWorkflowQuerier(new Set([`evaluations:refreshAlignment:${evaluation.id}`]))),
      ),
    )

    expect(state).toEqual({ kind: "realigning", evaluationId: evaluation.id })
  })

  it("prefers `generating` over `realigning` when both signals fire", async () => {
    const evaluation = makeEvaluation()
    const state = await Effect.runPromise(
      deriveSignalAlignmentState({ signalId, activeEvaluations: [evaluation] }).pipe(
        Effect.provide(
          provideWorkflowQuerier(new Set([`evaluations:generate:${signalId}`, `evaluations:optimize:${evaluation.id}`])),
        ),
      ),
    )

    expect(state).toEqual({ kind: "generating" })
  })

  it("ignores `isAutomaticallyMonitored` once an active evaluation exists — `idle`/`realigning` take over", async () => {
    const evaluation = makeEvaluation()
    const state = await Effect.runPromise(
      deriveSignalAlignmentState({
        signalId,
        activeEvaluations: [evaluation],
        isAutomaticallyMonitored: true,
      }).pipe(Effect.provide(provideWorkflowQuerier())),
    )

    expect(state).toEqual({ kind: "idle" })
  })
})

const createEvaluationRepository = (activeEvaluations: readonly Evaluation[]): EvaluationRepositoryShape => ({
  findById: () => Effect.die("Unexpected findById"),
  save: () => Effect.die("Unexpected save"),
  listByProjectId: () => Effect.die("Unexpected listByProjectId"),
  listBySignalId: () =>
    Effect.succeed({
      items: activeEvaluations,
      hasMore: false,
      limit: activeEvaluations.length,
      offset: 0,
    }),
  listBySignalIds: () => Effect.die("Unexpected listBySignalIds"),
  archive: () => Effect.die("Unexpected archive"),
  unarchive: () => Effect.die("Unexpected unarchive"),
  softDelete: () => Effect.die("Unexpected softDelete"),
  softDeleteBySignalId: () => Effect.die("Unexpected softDeleteBySignalId"),
})

describe("getSignalAlignmentStateUseCase", () => {
  it("loads active evaluations and returns the derived state", async () => {
    const state = await Effect.runPromise(
      getSignalAlignmentStateUseCase({ projectId, signalId }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(EvaluationRepository, createEvaluationRepository([makeEvaluation()])),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
            provideWorkflowQuerier(),
          ),
        ),
      ),
    )

    expect(state).toEqual({ kind: "idle" })
  })

  it("threads `isAutomaticallyMonitored` through to the deriver", async () => {
    const state = await Effect.runPromise(
      getSignalAlignmentStateUseCase({ projectId, signalId, isAutomaticallyMonitored: true }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(EvaluationRepository, createEvaluationRepository([])),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
            provideWorkflowQuerier(),
          ),
        ),
      ),
    )

    expect(state).toEqual({ kind: "automatic" })
  })
})
