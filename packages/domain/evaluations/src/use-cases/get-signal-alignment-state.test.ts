import { type WorkflowDescription, WorkflowQuerier, type WorkflowQuerierShape } from "@domain/queue"
import { EvaluationId, OrganizationId, ProjectId, SignalId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { defaultEvaluationTrigger, type Evaluation, emptyEvaluationAlignment } from "../entities/evaluation.ts"
import { EvaluationRepository, type EvaluationRepositoryShape } from "../ports/evaluation-repository.ts"
import { deriveSignalAlignmentState, getSignalAlignmentStateUseCase } from "./get-signal-alignment-state.ts"

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

const provideWorkflowQuerier = (
  running: ReadonlySet<string> = new Set(),
  failed: ReadonlyMap<string, string | null> = new Map(),
) => {
  const querier: WorkflowQuerierShape = {
    describe: (workflowId) =>
      Effect.sync(() => {
        if (running.has(workflowId)) {
          return {
            status: "running",
            runId: "run-1",
            startTime: new Date("2026-04-01T00:00:00.000Z"),
            closeTime: null,
            failure: null,
          }
        }
        if (failed.has(workflowId)) {
          return {
            status: "failed",
            runId: "run-1",
            startTime: new Date("2026-04-01T00:00:00.000Z"),
            closeTime: new Date("2026-04-01T00:01:00.000Z"),
            failure: failed.get(workflowId) ?? null,
          }
        }
        return null
      }),
    query: () => Effect.die("Unexpected query"),
  }
  return Layer.succeed(WorkflowQuerier, querier)
}

// Flexible provider: maps each workflow id to an explicit description so tests
// can control status and `closeTime` (needed to exercise latest-wins logic).
const provideWorkflowDescriptions = (descriptions: ReadonlyMap<string, WorkflowDescription>) => {
  const querier: WorkflowQuerierShape = {
    describe: (workflowId) => Effect.sync(() => descriptions.get(workflowId) ?? null),
    query: () => Effect.die("Unexpected query"),
  }
  return Layer.succeed(WorkflowQuerier, querier)
}

const closedWorkflow = (
  status: WorkflowDescription["status"],
  closeIso: string,
  failure: string | null = null,
): WorkflowDescription => ({
  status,
  runId: "run-1",
  startTime: new Date("2026-04-01T00:00:00.000Z"),
  closeTime: new Date(closeIso),
  failure,
})

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
          provideWorkflowQuerier(
            new Set([`evaluations:generate:${signalId}`, `evaluations:optimize:${evaluation.id}`]),
          ),
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

  it("returns `failed` (generate) with the reason when generation failed and no evaluation exists", async () => {
    const state = await Effect.runPromise(
      deriveSignalAlignmentState({ signalId, activeEvaluations: [] }).pipe(
        Effect.provide(
          provideWorkflowQuerier(new Set(), new Map([[`evaluations:generate:${signalId}`, "not enough examples"]])),
        ),
      ),
    )

    expect(state).toEqual({ kind: "failed", phase: "generate", reason: "not enough examples" })
  })

  it("suppresses a stale generation failure once an active evaluation exists — `idle`", async () => {
    const evaluation = makeEvaluation()
    const state = await Effect.runPromise(
      deriveSignalAlignmentState({ signalId, activeEvaluations: [evaluation] }).pipe(
        Effect.provide(
          provideWorkflowQuerier(new Set(), new Map([[`evaluations:generate:${signalId}`, "old failure"]])),
        ),
      ),
    )

    expect(state).toEqual({ kind: "idle" })
  })

  it("returns `failed` (realign) with the reason when the optimize workflow failed for an evaluation", async () => {
    const evaluation = makeEvaluation()
    const state = await Effect.runPromise(
      deriveSignalAlignmentState({ signalId, activeEvaluations: [evaluation] }).pipe(
        Effect.provide(
          provideWorkflowQuerier(new Set(), new Map([[`evaluations:optimize:${evaluation.id}`, "GEPA crashed"]])),
        ),
      ),
    )

    expect(state).toEqual({ kind: "failed", phase: "realign", evaluationId: evaluation.id, reason: "GEPA crashed" })
  })

  it("suppresses a failed optimize once a later refresh completed successfully — `idle`", async () => {
    const evaluation = makeEvaluation()
    const state = await Effect.runPromise(
      deriveSignalAlignmentState({ signalId, activeEvaluations: [evaluation] }).pipe(
        Effect.provide(
          provideWorkflowDescriptions(
            new Map([
              [`evaluations:optimize:${evaluation.id}`, closedWorkflow("failed", "2026-04-01T00:01:00.000Z", "boom")],
              [
                `evaluations:refreshAlignment:${evaluation.id}`,
                closedWorkflow("completed", "2026-04-01T00:05:00.000Z"),
              ],
            ]),
          ),
        ),
      ),
    )

    expect(state).toEqual({ kind: "idle" })
  })

  it("returns `failed` when the failed optimize closed after a successful refresh", async () => {
    const evaluation = makeEvaluation()
    const state = await Effect.runPromise(
      deriveSignalAlignmentState({ signalId, activeEvaluations: [evaluation] }).pipe(
        Effect.provide(
          provideWorkflowDescriptions(
            new Map([
              [
                `evaluations:refreshAlignment:${evaluation.id}`,
                closedWorkflow("completed", "2026-04-01T00:01:00.000Z"),
              ],
              [
                `evaluations:optimize:${evaluation.id}`,
                closedWorkflow("failed", "2026-04-01T00:05:00.000Z", "GEPA crashed"),
              ],
            ]),
          ),
        ),
      ),
    )

    expect(state).toEqual({ kind: "failed", phase: "realign", evaluationId: evaluation.id, reason: "GEPA crashed" })
  })

  it("picks the most recently closed failure across multiple evaluations", async () => {
    const olderEval = makeEvaluation({ id: EvaluationId("a".repeat(24)) })
    const newerEval = makeEvaluation({ id: EvaluationId("b".repeat(24)) })
    const state = await Effect.runPromise(
      deriveSignalAlignmentState({ signalId, activeEvaluations: [olderEval, newerEval] }).pipe(
        Effect.provide(
          provideWorkflowDescriptions(
            new Map([
              [
                `evaluations:optimize:${olderEval.id}`,
                closedWorkflow("failed", "2026-04-01T00:01:00.000Z", "old boom"),
              ],
              [
                `evaluations:optimize:${newerEval.id}`,
                closedWorkflow("failed", "2026-04-01T00:09:00.000Z", "new boom"),
              ],
            ]),
          ),
        ),
      ),
    )

    expect(state).toEqual({ kind: "failed", phase: "realign", evaluationId: newerEval.id, reason: "new boom" })
  })

  it("suppresses a stale generate failure when a later realignment completed", async () => {
    const evaluation = makeEvaluation()
    const state = await Effect.runPromise(
      deriveSignalAlignmentState({ signalId, activeEvaluations: [evaluation] }).pipe(
        Effect.provide(
          provideWorkflowDescriptions(
            new Map([
              [`evaluations:generate:${signalId}`, closedWorkflow("failed", "2026-04-01T00:01:00.000Z", "old failure")],
              [
                `evaluations:refreshAlignment:${evaluation.id}`,
                closedWorkflow("completed", "2026-04-01T00:05:00.000Z"),
              ],
            ]),
          ),
        ),
      ),
    )

    expect(state).toEqual({ kind: "idle" })
  })

  it("prefers a running realignment over a failed one", async () => {
    const evaluation = makeEvaluation()
    const state = await Effect.runPromise(
      deriveSignalAlignmentState({ signalId, activeEvaluations: [evaluation] }).pipe(
        Effect.provide(
          provideWorkflowQuerier(
            new Set([`evaluations:refreshAlignment:${evaluation.id}`]),
            new Map([[`evaluations:optimize:${evaluation.id}`, "old failure"]]),
          ),
        ),
      ),
    )

    expect(state).toEqual({ kind: "realigning", evaluationId: evaluation.id })
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
