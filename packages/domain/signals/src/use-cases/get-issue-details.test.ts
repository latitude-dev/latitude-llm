import {
  defaultEvaluationTrigger,
  type Evaluation,
  EvaluationRepository,
  type EvaluationRepositoryShape,
  emptyEvaluationAlignment,
} from "@domain/evaluations"
import { WorkflowQuerier, type WorkflowQuerierShape } from "@domain/queue"
import type { SignalOccurrenceAggregate, SignalOccurrenceBucket, SignalTagsAggregate } from "@domain/scores"
import { ScoreAnalyticsRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import { ChSqlClient, EvaluationId, OrganizationId, ProjectId, SignalId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal, SignalSource } from "../entities/issue.ts"
import { createSignalCentroid } from "../helpers.ts"
import { SignalRepository } from "../ports/issue-repository.ts"
import { createFakeSignalRepository } from "../testing/index.ts"
import { getSignalDetailsUseCase } from "./get-issue-details.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const signalId = SignalId("i".repeat(24))

const makeSignal = (overrides: Partial<Signal> = {}): Signal => ({
  id: signalId,
  slug: "test-issue",
  organizationId,
  projectId,
  name: "Sample issue",
  description: "Sample description",
  source: "annotation",
  assigneeId: null,
  priority: null,
  centroid: createSignalCentroid(),
  clusteredAt: new Date("2026-03-01T00:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
  updatedAt: new Date("2026-03-01T00:00:00.000Z"),
  ...overrides,
})

const makeEvaluation = (overrides: Partial<Evaluation> = {}): Evaluation =>
  ({
    id: EvaluationId("e".repeat(24)),
    organizationId,
    projectId,
    signalId,
    name: "Eval",
    description: "Generated description",
    script: "return { passed: false }",
    legacyPolarity: false,
    trigger: defaultEvaluationTrigger(),
    alignment: emptyEvaluationAlignment("hash-1"),
    alignedAt: new Date("2026-04-01T00:00:00.000Z"),
    archivedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    ...overrides,
  }) as Evaluation

const makeOccurrence = (overrides: Partial<SignalOccurrenceAggregate> = {}): SignalOccurrenceAggregate => ({
  signalId,
  totalOccurrences: 10,
  recentOccurrences: 2,
  baselineAvgOccurrences: 1,
  firstSeenAt: new Date("2026-03-05T00:00:00.000Z"),
  lastSeenAt: new Date("2026-04-10T00:00:00.000Z"),
  ...overrides,
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

interface BuildLayerInput {
  readonly source?: SignalSource
  readonly occurrence?: SignalOccurrenceAggregate | null
  readonly trend?: readonly SignalOccurrenceBucket[]
  readonly tags?: readonly SignalTagsAggregate[]
  readonly totalTraces?: number
  readonly activeEvaluations?: readonly Evaluation[]
  readonly runningWorkflows?: ReadonlySet<string>
}

const buildLayer = (input: BuildLayerInput = {}) => {
  const issue = makeSignal({ source: input.source ?? "annotation" })
  const { repository: signalRepository } = createFakeSignalRepository([issue])

  const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
    aggregateBySignals: () => Effect.succeed(input.occurrence === null ? [] : [input.occurrence ?? makeOccurrence()]),
    trendBySignal: () => Effect.succeed(input.trend ?? []),
    aggregateTagsBySignals: () => Effect.succeed(input.tags ?? []),
  })

  const { repository: traceRepo } = createFakeTraceRepository({
    countByProjectId: () => Effect.succeed(input.totalTraces ?? 0),
  })

  return Layer.mergeAll(
    Layer.succeed(SignalRepository, signalRepository),
    Layer.succeed(EvaluationRepository, createEvaluationRepository(input.activeEvaluations ?? [])),
    Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
    Layer.succeed(TraceRepository, traceRepo),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
    provideWorkflowQuerier(input.runningWorkflows),
  )
}

describe("getSignalDetailsUseCase", () => {
  it("returns the full-detail view with lifetime stats and active evaluations", async () => {
    const evaluation = makeEvaluation()
    const layer = buildLayer({
      occurrence: makeOccurrence({ totalOccurrences: 25 }),
      totalTraces: 100,
      tags: [{ signalId, tags: ["checkout", "billing"] }],
      activeEvaluations: [evaluation],
    })

    const result = await Effect.runPromise(
      getSignalDetailsUseCase({ organizationId, projectId, signalId }).pipe(Effect.provide(layer)),
    )

    expect(result.issue.id).toBe(signalId)
    expect(result.occurrences).toBe(25)
    expect(result.firstSeenAt?.toISOString()).toBe("2026-03-05T00:00:00.000Z")
    expect(result.lastSeenAt?.toISOString()).toBe("2026-04-10T00:00:00.000Z")
    expect(result.affectedTracesPercent).toBeCloseTo(0.25)
    expect(result.tags).toEqual(["checkout", "billing"])
    expect(result.evaluations.map((e) => e.id)).toEqual([evaluation.id])
  })

  it("returns nulls for first/last seen and 0 occurrences when no aggregate is found", async () => {
    const layer = buildLayer({ occurrence: null, totalTraces: 50 })

    const result = await Effect.runPromise(
      getSignalDetailsUseCase({ organizationId, projectId, signalId }).pipe(Effect.provide(layer)),
    )

    expect(result.occurrences).toBe(0)
    expect(result.firstSeenAt).toBeNull()
    expect(result.lastSeenAt).toBeNull()
    expect(result.affectedTracesPercent).toBe(0)
  })

  it("clamps `affectedTracesPercent` to 1 when occurrences exceed total traces", async () => {
    const layer = buildLayer({
      occurrence: makeOccurrence({ totalOccurrences: 200 }),
      totalTraces: 100,
    })

    const result = await Effect.runPromise(
      getSignalDetailsUseCase({ organizationId, projectId, signalId }).pipe(Effect.provide(layer)),
    )

    expect(result.affectedTracesPercent).toBe(1)
  })

  it("returns 0 percent when the project has zero traces (division-by-zero guard)", async () => {
    const layer = buildLayer({
      occurrence: makeOccurrence({ totalOccurrences: 5 }),
      totalTraces: 0,
    })

    const result = await Effect.runPromise(
      getSignalDetailsUseCase({ organizationId, projectId, signalId }).pipe(Effect.provide(layer)),
    )

    expect(result.affectedTracesPercent).toBe(0)
  })

  describe("alignmentState", () => {
    it("returns `automatic` for a flagger-source issue with no active evaluations", async () => {
      const layer = buildLayer({ source: "flagger" })

      const result = await Effect.runPromise(
        getSignalDetailsUseCase({ organizationId, projectId, signalId }).pipe(Effect.provide(layer)),
      )

      expect(result.alignmentState).toEqual({ kind: "automatic" })
    })

    it("returns `idle` for a flagger-source issue once an evaluation has been created (manual override)", async () => {
      const layer = buildLayer({ source: "flagger", activeEvaluations: [makeEvaluation()] })

      const result = await Effect.runPromise(
        getSignalDetailsUseCase({ organizationId, projectId, signalId }).pipe(Effect.provide(layer)),
      )

      expect(result.alignmentState).toEqual({ kind: "idle" })
    })

    it("returns `idle` for a non-flagger-source issue with no workflows in flight", async () => {
      const layer = buildLayer({ source: "annotation" })

      const result = await Effect.runPromise(
        getSignalDetailsUseCase({ organizationId, projectId, signalId }).pipe(Effect.provide(layer)),
      )

      expect(result.alignmentState).toEqual({ kind: "idle" })
    })

    it("returns `generating` when the per-issue generation workflow is running", async () => {
      const layer = buildLayer({
        source: "annotation",
        runningWorkflows: new Set([`evaluations:generate:${signalId}`]),
      })

      const result = await Effect.runPromise(
        getSignalDetailsUseCase({ organizationId, projectId, signalId }).pipe(Effect.provide(layer)),
      )

      expect(result.alignmentState).toEqual({ kind: "generating" })
    })

    it("returns `realigning` when an optimization workflow is running for an active evaluation", async () => {
      const evaluation = makeEvaluation()
      const layer = buildLayer({
        source: "annotation",
        activeEvaluations: [evaluation],
        runningWorkflows: new Set([`evaluations:optimize:${evaluation.id}`]),
      })

      const result = await Effect.runPromise(
        getSignalDetailsUseCase({ organizationId, projectId, signalId }).pipe(Effect.provide(layer)),
      )

      expect(result.alignmentState).toEqual({ kind: "realigning", evaluationId: evaluation.id })
    })
  })
})
