import {
  defaultEvaluationTrigger,
  type Evaluation,
  EvaluationRepository,
  type EvaluationRepositoryShape,
  emptyEvaluationAlignment,
} from "@domain/evaluations"
import { WorkflowQuerier, type WorkflowQuerierShape } from "@domain/queue"
import type { IssueOccurrenceAggregate, IssueOccurrenceBucket, IssueTagsAggregate } from "@domain/scores"
import { ScoreAnalyticsRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import { ChSqlClient, EvaluationId, IssueId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Issue, IssueSource } from "../entities/issue.ts"
import { createIssueCentroid } from "../helpers.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueRepository } from "../testing/index.ts"
import { getIssueDetailsUseCase } from "./get-issue-details.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const issueId = IssueId("i".repeat(24))

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: issueId,
  slug: "test-issue",
  organizationId,
  projectId,
  name: "Sample issue",
  description: "Sample description",
  source: "annotation",
  centroid: createIssueCentroid(),
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
    issueId,
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

const makeOccurrence = (overrides: Partial<IssueOccurrenceAggregate> = {}): IssueOccurrenceAggregate => ({
  issueId,
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
  listByIssueId: () =>
    Effect.succeed({
      items: activeEvaluations,
      hasMore: false,
      limit: activeEvaluations.length,
      offset: 0,
    }),
  listByIssueIds: () => Effect.die("Unexpected listByIssueIds"),
  archive: () => Effect.die("Unexpected archive"),
  unarchive: () => Effect.die("Unexpected unarchive"),
  softDelete: () => Effect.die("Unexpected softDelete"),
  softDeleteByIssueId: () => Effect.die("Unexpected softDeleteByIssueId"),
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
  readonly source?: IssueSource
  readonly occurrence?: IssueOccurrenceAggregate | null
  readonly trend?: readonly IssueOccurrenceBucket[]
  readonly tags?: readonly IssueTagsAggregate[]
  readonly totalTraces?: number
  readonly activeEvaluations?: readonly Evaluation[]
  readonly runningWorkflows?: ReadonlySet<string>
}

const buildLayer = (input: BuildLayerInput = {}) => {
  const issue = makeIssue({ source: input.source ?? "annotation" })
  const { repository: issueRepository } = createFakeIssueRepository([issue])

  const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
    aggregateByIssues: () => Effect.succeed(input.occurrence === null ? [] : [input.occurrence ?? makeOccurrence()]),
    trendByIssue: () => Effect.succeed(input.trend ?? []),
    aggregateTagsByIssues: () => Effect.succeed(input.tags ?? []),
  })

  const { repository: traceRepo } = createFakeTraceRepository({
    countByProjectId: () => Effect.succeed(input.totalTraces ?? 0),
  })

  return Layer.mergeAll(
    Layer.succeed(IssueRepository, issueRepository),
    Layer.succeed(EvaluationRepository, createEvaluationRepository(input.activeEvaluations ?? [])),
    Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
    Layer.succeed(TraceRepository, traceRepo),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
    provideWorkflowQuerier(input.runningWorkflows),
  )
}

describe("getIssueDetailsUseCase", () => {
  it("returns the full-detail view with lifetime stats and active evaluations", async () => {
    const evaluation = makeEvaluation()
    const layer = buildLayer({
      occurrence: makeOccurrence({ totalOccurrences: 25 }),
      totalTraces: 100,
      tags: [{ issueId, tags: ["checkout", "billing"] }],
      activeEvaluations: [evaluation],
    })

    const result = await Effect.runPromise(
      getIssueDetailsUseCase({ organizationId, projectId, issueId }).pipe(Effect.provide(layer)),
    )

    expect(result.issue.id).toBe(issueId)
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
      getIssueDetailsUseCase({ organizationId, projectId, issueId }).pipe(Effect.provide(layer)),
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
      getIssueDetailsUseCase({ organizationId, projectId, issueId }).pipe(Effect.provide(layer)),
    )

    expect(result.affectedTracesPercent).toBe(1)
  })

  it("returns 0 percent when the project has zero traces (division-by-zero guard)", async () => {
    const layer = buildLayer({
      occurrence: makeOccurrence({ totalOccurrences: 5 }),
      totalTraces: 0,
    })

    const result = await Effect.runPromise(
      getIssueDetailsUseCase({ organizationId, projectId, issueId }).pipe(Effect.provide(layer)),
    )

    expect(result.affectedTracesPercent).toBe(0)
  })

  describe("alignmentState", () => {
    it("returns `automatic` for a flagger-source issue with no active evaluations", async () => {
      const layer = buildLayer({ source: "flagger" })

      const result = await Effect.runPromise(
        getIssueDetailsUseCase({ organizationId, projectId, issueId }).pipe(Effect.provide(layer)),
      )

      expect(result.alignmentState).toEqual({ kind: "automatic" })
    })

    it("returns `idle` for a flagger-source issue once an evaluation has been created (manual override)", async () => {
      const layer = buildLayer({ source: "flagger", activeEvaluations: [makeEvaluation()] })

      const result = await Effect.runPromise(
        getIssueDetailsUseCase({ organizationId, projectId, issueId }).pipe(Effect.provide(layer)),
      )

      expect(result.alignmentState).toEqual({ kind: "idle" })
    })

    it("returns `idle` for a non-flagger-source issue with no workflows in flight", async () => {
      const layer = buildLayer({ source: "annotation" })

      const result = await Effect.runPromise(
        getIssueDetailsUseCase({ organizationId, projectId, issueId }).pipe(Effect.provide(layer)),
      )

      expect(result.alignmentState).toEqual({ kind: "idle" })
    })

    it("returns `generating` when the per-issue generation workflow is running", async () => {
      const layer = buildLayer({
        source: "annotation",
        runningWorkflows: new Set([`evaluations:generate:${issueId}`]),
      })

      const result = await Effect.runPromise(
        getIssueDetailsUseCase({ organizationId, projectId, issueId }).pipe(Effect.provide(layer)),
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
        getIssueDetailsUseCase({ organizationId, projectId, issueId }).pipe(Effect.provide(layer)),
      )

      expect(result.alignmentState).toEqual({ kind: "realigning", evaluationId: evaluation.id })
    })
  })
})
