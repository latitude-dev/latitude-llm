import {
  defaultEvaluationTrigger,
  type Evaluation,
  EvaluationRepository,
  type EvaluationRepositoryShape,
  emptyEvaluationAlignment,
} from "@domain/evaluations"
import {
  type IssueOccurrenceAggregate,
  type IssueOccurrenceBucket,
  type IssueTrendSeries,
  type IssueWindowMetric,
  ScoreAnalyticsRepository,
  type ScoreAnalyticsRepositoryShape,
} from "@domain/scores"
import { ChSqlClient, EvaluationId, IssueId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { type Issue, IssueState } from "../entities/issue.ts"
import { createIssueCentroid } from "../helpers.ts"
import { IssueProjectionRepository } from "../ports/issue-projection-repository.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueRepository } from "../testing/fake-issue-repository.ts"
import { listIssuesUseCase } from "./list-issues.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: IssueId("i".repeat(24)),
  uuid: "11111111-1111-4111-8111-111111111111",
  organizationId: organizationId as string,
  projectId: projectId as string,
  name: "Issue candidate",
  description: "Repeated assistant failure",
  centroid: createIssueCentroid(),
  clusteredAt: new Date("2026-03-01T00:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
  updatedAt: new Date("2026-03-01T00:00:00.000Z"),
  ...overrides,
})

const makeEvaluation = (overrides: Partial<Evaluation> = {}): Evaluation => ({
  id: EvaluationId("e".repeat(24)),
  organizationId: organizationId as string,
  projectId: projectId as string,
  issueId: IssueId("i".repeat(24)),
  name: "Monitor issue",
  description: "Regression monitor",
  script: "return { passed: false }",
  trigger: defaultEvaluationTrigger(),
  alignment: emptyEvaluationAlignment("hash-v1"),
  alignedAt: new Date("2026-04-01T00:00:00.000Z"),
  archivedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-04-01T00:00:00.000Z"),
  updatedAt: new Date("2026-04-01T00:00:00.000Z"),
  ...overrides,
})

const makeWindowMetric = (overrides: Partial<IssueWindowMetric> = {}): IssueWindowMetric => ({
  issueId: IssueId("i".repeat(24)),
  occurrences: 1,
  firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
  lastSeenAt: new Date("2026-04-01T00:00:00.000Z"),
  ...overrides,
})

const makeOccurrence = (overrides: Partial<IssueOccurrenceAggregate> = {}): IssueOccurrenceAggregate => ({
  issueId: IssueId("i".repeat(24)),
  totalOccurrences: 10,
  recentOccurrences: 2,
  baselineAvgOccurrences: 1,
  firstSeenAt: new Date("2026-03-01T00:00:00.000Z"),
  lastSeenAt: new Date("2026-04-01T00:00:00.000Z"),
  ...overrides,
})

const createEvaluationRepository = (seed: readonly Evaluation[] = []) => {
  const listByIssueIdsCalls: Array<readonly string[]> = []
  const repository: EvaluationRepositoryShape = {
    findById: () => Effect.die("Unexpected EvaluationRepository.findById in listIssuesUseCase test"),
    save: () => Effect.die("Unexpected EvaluationRepository.save in listIssuesUseCase test"),
    listByProjectId: () => Effect.die("Unexpected EvaluationRepository.listByProjectId in listIssuesUseCase test"),
    listByIssueId: () => Effect.die("Unexpected EvaluationRepository.listByIssueId in listIssuesUseCase test"),
    listByIssueIds: ({ issueIds, options }) =>
      Effect.sync(() => {
        listByIssueIdsCalls.push(issueIds)
        const filteredSeed = seed.filter((evaluation) => {
          if (!issueIds.some((issueId) => issueId === evaluation.issueId)) {
            return false
          }

          switch (options?.lifecycle) {
            case "archived":
              return evaluation.deletedAt === null && evaluation.archivedAt !== null
            case "all":
              return evaluation.deletedAt === null
            default:
              return evaluation.deletedAt === null && evaluation.archivedAt === null
          }
        })

        return {
          items: filteredSeed,
          hasMore: false,
          limit: filteredSeed.length,
          offset: 0,
        }
      }),
    archive: () => Effect.die("Unexpected EvaluationRepository.archive in listIssuesUseCase test"),
    unarchive: () => Effect.die("Unexpected EvaluationRepository.unarchive in listIssuesUseCase test"),
    softDelete: () => Effect.die("Unexpected EvaluationRepository.softDelete in listIssuesUseCase test"),
    softDeleteByIssueId: () =>
      Effect.die("Unexpected EvaluationRepository.softDeleteByIssueId in listIssuesUseCase test"),
  }

  return { repository, listByIssueIdsCalls }
}

const createScoreAnalyticsRepository = (input: {
  readonly windowMetrics: readonly IssueWindowMetric[]
  readonly fullHistoryOccurrences: readonly IssueOccurrenceAggregate[]
  readonly histogramBuckets?: readonly IssueOccurrenceBucket[]
  readonly trendSeries?: readonly IssueTrendSeries[]
  readonly totalTraces?: number
}) => {
  const windowMetricInputs: unknown[] = []
  const aggregateInputs: unknown[] = []
  const histogramInputs: Array<{ issueIds: readonly string[]; from: Date; to: Date }> = []
  const trendInputs: Array<{ issueIds: readonly string[]; from: Date; to: Date }> = []

  const repository: ScoreAnalyticsRepositoryShape = {
    existsById: () => Effect.die("Unexpected existsById"),
    insert: () => Effect.die("Unexpected insert"),
    delete: () => Effect.die("Unexpected delete"),
    aggregateByProject: () => Effect.die("Unexpected aggregateByProject"),
    aggregateBySource: () => Effect.die("Unexpected aggregateBySource"),
    trendBySource: () => Effect.die("Unexpected trendBySource"),
    trendByProject: () => Effect.die("Unexpected trendByProject"),
    rollupByTraceIds: () => Effect.die("Unexpected rollupByTraceIds"),
    rollupBySessionIds: () => Effect.die("Unexpected rollupBySessionIds"),
    aggregateByIssues: (aggregateInput) =>
      Effect.sync(() => {
        aggregateInputs.push(aggregateInput)
        return input.fullHistoryOccurrences.filter((occurrence) => aggregateInput.issueIds.includes(occurrence.issueId))
      }),
    trendByIssue: () => Effect.die("Unexpected trendByIssue"),
    listIssueWindowMetrics: (windowMetricInput) =>
      Effect.sync(() => {
        windowMetricInputs.push(windowMetricInput)
        return input.windowMetrics
      }),
    histogramByIssues: ({ issueIds, timeRange }) =>
      Effect.sync(() => {
        histogramInputs.push({
          issueIds,
          from: timeRange.from ?? new Date(0),
          to: timeRange.to ?? new Date(0),
        })
        return input.histogramBuckets ?? []
      }),
    trendByIssues: ({ issueIds, timeRange }) =>
      Effect.sync(() => {
        trendInputs.push({
          issueIds,
          from: timeRange.from ?? new Date(0),
          to: timeRange.to ?? new Date(0),
        })
        return input.trendSeries ?? []
      }),
    countDistinctTracesByTimeRange: () => Effect.succeed(input.totalTraces ?? 0),
    listTracesByIssue: () => Effect.die("Unexpected listTracesByIssue"),
  }

  return { repository, windowMetricInputs, aggregateInputs, histogramInputs, trendInputs }
}

const createIssueProjectionRepository = (
  candidates: readonly {
    uuid: string
    title: string
    description: string
    score: number
  }[],
) => {
  const calls: Array<{ query: string; vector: readonly number[] }> = []

  const repository = {
    upsert: () => Effect.die("Unexpected IssueProjectionRepository.upsert in listIssuesUseCase test"),
    delete: () => Effect.die("Unexpected IssueProjectionRepository.delete in listIssuesUseCase test"),
    hybridSearch: (input: { readonly query: string; readonly vector: readonly number[] }) =>
      Effect.sync(() => {
        calls.push({ query: input.query, vector: input.vector })
        return candidates
      }),
  }

  return { repository, calls }
}

describe("listIssuesUseCase", () => {
  it("enriches the default listing with derived lifecycle states", async () => {
    const now = new Date("2026-04-10T00:00:00.000Z")
    const newestIssue = makeIssue({
      id: IssueId("aaaaaaaaaaaaaaaaaaaaaaaa"),
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      createdAt: new Date("2026-04-07T08:00:00.000Z"),
      updatedAt: new Date("2026-04-07T08:00:00.000Z"),
      clusteredAt: new Date("2026-04-07T08:00:00.000Z"),
    })
    const regressedIssue = makeIssue({
      id: IssueId("bbbbbbbbbbbbbbbbbbbbbbbb"),
      uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      resolvedAt: new Date("2026-04-01T12:00:00.000Z"),
      createdAt: new Date("2026-03-20T08:00:00.000Z"),
      updatedAt: new Date("2026-03-20T08:00:00.000Z"),
      clusteredAt: new Date("2026-03-20T08:00:00.000Z"),
    })
    const ignoredIssue = makeIssue({
      id: IssueId("cccccccccccccccccccccccc"),
      uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      ignoredAt: new Date("2026-04-02T12:00:00.000Z"),
      createdAt: new Date("2026-03-10T08:00:00.000Z"),
      updatedAt: new Date("2026-03-10T08:00:00.000Z"),
      clusteredAt: new Date("2026-03-10T08:00:00.000Z"),
    })

    const { repository: issueRepository } = createFakeIssueRepository([ignoredIssue, regressedIssue, newestIssue])
    const { repository: evaluationRepository, listByIssueIdsCalls } = createEvaluationRepository()
    const {
      repository: scoreAnalyticsRepository,
      aggregateInputs,
      windowMetricInputs,
    } = createScoreAnalyticsRepository({
      windowMetrics: [
        makeWindowMetric({
          issueId: newestIssue.id,
          occurrences: 4,
          firstSeenAt: new Date("2026-04-07T08:00:00.000Z"),
          lastSeenAt: new Date("2026-04-09T20:00:00.000Z"),
        }),
        makeWindowMetric({
          issueId: regressedIssue.id,
          occurrences: 6,
          firstSeenAt: new Date("2026-03-20T08:00:00.000Z"),
          lastSeenAt: new Date("2026-04-05T08:00:00.000Z"),
        }),
        makeWindowMetric({
          issueId: ignoredIssue.id,
          occurrences: 2,
          firstSeenAt: new Date("2026-03-10T08:00:00.000Z"),
          lastSeenAt: new Date("2026-04-02T08:00:00.000Z"),
        }),
      ],
      fullHistoryOccurrences: [
        makeOccurrence({
          issueId: newestIssue.id,
          totalOccurrences: 4,
          recentOccurrences: 4,
          baselineAvgOccurrences: 2,
          firstSeenAt: new Date("2026-04-07T08:00:00.000Z"),
          lastSeenAt: new Date("2026-04-09T20:00:00.000Z"),
        }),
        makeOccurrence({
          issueId: regressedIssue.id,
          totalOccurrences: 6,
          recentOccurrences: 0,
          baselineAvgOccurrences: 0,
          firstSeenAt: new Date("2026-03-20T08:00:00.000Z"),
          lastSeenAt: new Date("2026-04-05T08:00:00.000Z"),
        }),
        makeOccurrence({
          issueId: ignoredIssue.id,
          totalOccurrences: 2,
          recentOccurrences: 0,
          baselineAvgOccurrences: 0,
          firstSeenAt: new Date("2026-03-10T08:00:00.000Z"),
          lastSeenAt: new Date("2026-04-02T08:00:00.000Z"),
        }),
      ],
      totalTraces: 0,
    })
    const { repository: issueProjectionRepository, calls } = createIssueProjectionRepository([])

    const result = await Effect.runPromise(
      listIssuesUseCase({
        organizationId,
        projectId,
        limit: 2,
        offset: 0,
        now,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(IssueRepository, issueRepository),
            Layer.succeed(EvaluationRepository, evaluationRepository),
            Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
            Layer.succeed(IssueProjectionRepository, issueProjectionRepository),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
          ),
        ),
      ),
    )

    expect(calls).toEqual([])
    expect(windowMetricInputs).toEqual([
      {
        organizationId,
        projectId,
      },
    ])
    expect(aggregateInputs).toEqual([
      {
        organizationId,
        projectId,
        issueIds: [newestIssue.id, regressedIssue.id, ignoredIssue.id],
      },
    ])
    expect(listByIssueIdsCalls).toEqual([[newestIssue.id, regressedIssue.id]])
    expect(result.items.map((issue) => ({ id: issue.id, states: issue.states }))).toEqual([
      {
        id: newestIssue.id,
        states: [IssueState.New],
      },
      {
        id: regressedIssue.id,
        states: [IssueState.Regressed],
      },
    ])
    expect(result.analytics.counts.regressedIssues).toBe(1)
    expect(result.analytics.counts.seenOccurrences).toBe(12)
    expect(result.totalCount).toBe(3)
    expect(result.hasMore).toBe(true)
    expect(result.limit).toBe(2)
    expect(result.offset).toBe(0)
  })

  it("keeps analytics independent from the lifecycle tab and hydrates only visible issue ids", async () => {
    const now = new Date("2026-04-10T12:00:00.000Z")
    const activeIssue = makeIssue({
      id: IssueId("a".repeat(24)),
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Active issue",
    })
    const regressedIssue = makeIssue({
      id: IssueId("b".repeat(24)),
      uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Regressed issue",
      resolvedAt: new Date("2026-04-05T00:00:00.000Z"),
    })
    const archivedIssue = makeIssue({
      id: IssueId("c".repeat(24)),
      uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      name: "Archived issue",
      resolvedAt: new Date("2026-04-07T00:00:00.000Z"),
    })

    const { repository: issueRepository } = createFakeIssueRepository([activeIssue, regressedIssue, archivedIssue])
    const { repository: evaluationRepository, listByIssueIdsCalls } = createEvaluationRepository([
      makeEvaluation({
        id: EvaluationId("1".repeat(24)),
        issueId: activeIssue.id,
        name: "Active monitor",
      }),
      makeEvaluation({
        id: EvaluationId("9".repeat(24)),
        issueId: activeIssue.id,
        name: "Archived monitor for active issue",
        archivedAt: new Date("2026-04-09T00:00:00.000Z"),
      }),
      makeEvaluation({
        id: EvaluationId("2".repeat(24)),
        issueId: archivedIssue.id,
        name: "Archived monitor",
      }),
    ])
    const {
      repository: scoreAnalyticsRepository,
      histogramInputs,
      trendInputs,
    } = createScoreAnalyticsRepository({
      windowMetrics: [
        makeWindowMetric({
          issueId: activeIssue.id,
          occurrences: 5,
          firstSeenAt: new Date("2026-03-01T00:00:00.000Z"),
          lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
        }),
        makeWindowMetric({
          issueId: regressedIssue.id,
          occurrences: 4,
          firstSeenAt: new Date("2026-03-02T00:00:00.000Z"),
          lastSeenAt: new Date("2026-04-08T00:00:00.000Z"),
        }),
        makeWindowMetric({
          issueId: archivedIssue.id,
          occurrences: 7,
          firstSeenAt: new Date("2026-03-03T00:00:00.000Z"),
          lastSeenAt: new Date("2026-04-04T00:00:00.000Z"),
        }),
      ],
      fullHistoryOccurrences: [
        makeOccurrence({
          issueId: activeIssue.id,
          recentOccurrences: 3,
          baselineAvgOccurrences: 1,
          lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
        }),
        makeOccurrence({
          issueId: regressedIssue.id,
          recentOccurrences: 1,
          baselineAvgOccurrences: 0,
          lastSeenAt: new Date("2026-04-08T00:00:00.000Z"),
        }),
        makeOccurrence({
          issueId: archivedIssue.id,
          recentOccurrences: 0,
          baselineAvgOccurrences: 0,
          lastSeenAt: new Date("2026-04-04T00:00:00.000Z"),
        }),
      ],
      histogramBuckets: [
        { bucket: "2026-04-09", count: 3 },
        { bucket: "2026-04-10", count: 2 },
      ],
      trendSeries: [
        {
          issueId: activeIssue.id,
          buckets: [{ bucket: "2026-04-09", count: 5 }],
        },
        {
          issueId: regressedIssue.id,
          buckets: [{ bucket: "2026-04-08", count: 4 }],
        },
      ],
      totalTraces: 10,
    })
    const { repository: issueProjectionRepository, calls } = createIssueProjectionRepository([])

    const result = await Effect.runPromise(
      listIssuesUseCase({
        organizationId,
        projectId,
        lifecycleGroup: "active",
        now,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(IssueRepository, issueRepository),
            Layer.succeed(EvaluationRepository, evaluationRepository),
            Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
            Layer.succeed(IssueProjectionRepository, issueProjectionRepository),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
          ),
        ),
      ),
    )

    expect(calls).toEqual([])
    expect(result.analytics.counts.resolvedIssues).toBe(1)
    expect(result.analytics.counts.regressedIssues).toBe(1)
    expect(result.analytics.counts.seenOccurrences).toBe(16)
    expect(result.items.map((item) => item.id)).toEqual([activeIssue.id, regressedIssue.id])
    expect(result.occurrencesSum).toBe(9)
    expect(result.items[0]?.affectedTracesPercent).toBe(0.5)
    expect(result.items[0]?.evaluations.map((evaluation) => evaluation.id)).toEqual([EvaluationId("1".repeat(24))])
    expect(result.items[1]?.evaluations).toEqual([])
    expect(result.analytics.histogram).toHaveLength(7)
    expect(result.items[0]?.trend).toHaveLength(14)
    expect(listByIssueIdsCalls).toEqual([[activeIssue.id, regressedIssue.id]])
    expect(histogramInputs[0]?.issueIds).toEqual([activeIssue.id, regressedIssue.id, archivedIssue.id])
    expect(histogramInputs[0]?.from.toISOString()).toBe("2026-04-04T00:00:00.000Z")
    expect(histogramInputs[0]?.to.toISOString()).toBe("2026-04-10T23:59:59.999Z")
    expect(trendInputs[0]?.issueIds).toEqual([activeIssue.id, regressedIssue.id])
    expect(trendInputs[0]?.from.toISOString()).toBe("2026-03-28T00:00:00.000Z")
    expect(trendInputs[0]?.to.toISOString()).toBe("2026-04-10T23:59:59.999Z")
  })

  describe("analytics histogram time range", () => {
    type HistogramRangeCase = {
      readonly name: string
      readonly timeRange:
        | {
            readonly from?: Date
            readonly to?: Date
          }
        | undefined
      readonly expectedFromIso: string
      readonly expectedToIso: string
      readonly expectedBuckets: readonly string[]
    }

    const cases: readonly HistogramRangeCase[] = [
      {
        name: "shows the last 7 days ending today when no range is selected",
        timeRange: undefined,
        expectedFromIso: "2026-04-04T00:00:00.000Z",
        expectedToIso: "2026-04-10T23:59:59.999Z",
        expectedBuckets: [
          "2026-04-04",
          "2026-04-05",
          "2026-04-06",
          "2026-04-07",
          "2026-04-08",
          "2026-04-09",
          "2026-04-10",
        ],
      },
      {
        name: "shows the range from from through today when only from is selected",
        timeRange: {
          from: new Date("2026-03-15T09:30:00.000Z"),
        },
        expectedFromIso: "2026-03-15T00:00:00.000Z",
        expectedToIso: "2026-04-10T23:59:59.999Z",
        expectedBuckets: [
          "2026-03-15",
          "2026-03-16",
          "2026-03-17",
          "2026-03-18",
          "2026-03-19",
          "2026-03-20",
          "2026-03-21",
          "2026-03-22",
          "2026-03-23",
          "2026-03-24",
          "2026-03-25",
          "2026-03-26",
          "2026-03-27",
          "2026-03-28",
          "2026-03-29",
          "2026-03-30",
          "2026-03-31",
          "2026-04-01",
          "2026-04-02",
          "2026-04-03",
          "2026-04-04",
          "2026-04-05",
          "2026-04-06",
          "2026-04-07",
          "2026-04-08",
          "2026-04-09",
          "2026-04-10",
        ],
      },
      {
        name: "shows the last 7 days ending at to when only to is selected",
        timeRange: {
          to: new Date("2026-04-03T09:30:00.000Z"),
        },
        expectedFromIso: "2026-03-28T00:00:00.000Z",
        expectedToIso: "2026-04-03T23:59:59.999Z",
        expectedBuckets: [
          "2026-03-28",
          "2026-03-29",
          "2026-03-30",
          "2026-03-31",
          "2026-04-01",
          "2026-04-02",
          "2026-04-03",
        ],
      },
      {
        name: "shows every selected day when from and to are selected",
        timeRange: {
          from: new Date("2026-04-01T10:15:00.000Z"),
          to: new Date("2026-04-03T21:45:00.000Z"),
        },
        expectedFromIso: "2026-04-01T00:00:00.000Z",
        expectedToIso: "2026-04-03T23:59:59.999Z",
        expectedBuckets: ["2026-04-01", "2026-04-02", "2026-04-03"],
      },
    ]

    it.each(cases)("$name", async ({ timeRange, expectedFromIso, expectedToIso, expectedBuckets }) => {
      const now = new Date("2026-04-10T12:00:00.000Z")
      const issue = makeIssue({
        id: IssueId("m".repeat(24)),
        uuid: "56565656-5656-4565-8565-565656565656",
        name: "Histogram issue",
      })

      const { repository: issueRepository } = createFakeIssueRepository([issue])
      const { repository: evaluationRepository } = createEvaluationRepository()
      const { repository: scoreAnalyticsRepository, histogramInputs } = createScoreAnalyticsRepository({
        windowMetrics: [
          makeWindowMetric({
            issueId: issue.id,
            occurrences: 3,
            firstSeenAt: new Date("2026-03-01T00:00:00.000Z"),
            lastSeenAt: new Date("2026-04-10T00:00:00.000Z"),
          }),
        ],
        fullHistoryOccurrences: [
          makeOccurrence({
            issueId: issue.id,
            totalOccurrences: 3,
            recentOccurrences: 3,
            baselineAvgOccurrences: 1,
            firstSeenAt: new Date("2026-03-01T00:00:00.000Z"),
            lastSeenAt: new Date("2026-04-10T00:00:00.000Z"),
          }),
        ],
        totalTraces: 3,
      })
      const { repository: issueProjectionRepository } = createIssueProjectionRepository([])

      const result = await Effect.runPromise(
        listIssuesUseCase({
          organizationId,
          projectId,
          ...(timeRange ? { timeRange } : {}),
          now,
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(IssueRepository, issueRepository),
              Layer.succeed(EvaluationRepository, evaluationRepository),
              Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
              Layer.succeed(IssueProjectionRepository, issueProjectionRepository),
              Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
              Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
            ),
          ),
        ),
      )

      expect(histogramInputs[0]?.issueIds).toEqual([issue.id])
      expect(histogramInputs[0]?.from.toISOString()).toBe(expectedFromIso)
      expect(histogramInputs[0]?.to.toISOString()).toBe(expectedToIso)
      expect(result.analytics.histogram.map((bucket) => bucket.bucket)).toEqual(expectedBuckets)
    })
  })

  it("intersects search candidates and uses similarity as the final default-sort tie-breaker", async () => {
    const now = new Date("2026-04-10T12:00:00.000Z")
    const firstIssue = makeIssue({
      id: IssueId("d".repeat(24)),
      uuid: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      name: "First search match",
    })
    const secondIssue = makeIssue({
      id: IssueId("e".repeat(24)),
      uuid: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      name: "Second search match",
    })
    const thirdIssue = makeIssue({
      id: IssueId("f".repeat(24)),
      uuid: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      name: "Filtered by search",
    })

    const { repository: issueRepository } = createFakeIssueRepository([firstIssue, secondIssue, thirdIssue])
    const { repository: evaluationRepository } = createEvaluationRepository()
    const { repository: scoreAnalyticsRepository, histogramInputs } = createScoreAnalyticsRepository({
      windowMetrics: [
        makeWindowMetric({
          issueId: firstIssue.id,
          occurrences: 4,
          lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
        }),
        makeWindowMetric({
          issueId: secondIssue.id,
          occurrences: 4,
          lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
        }),
        makeWindowMetric({
          issueId: thirdIssue.id,
          occurrences: 9,
          lastSeenAt: new Date("2026-04-10T00:00:00.000Z"),
        }),
      ],
      fullHistoryOccurrences: [
        makeOccurrence({ issueId: firstIssue.id, lastSeenAt: new Date("2026-04-09T00:00:00.000Z") }),
        makeOccurrence({ issueId: secondIssue.id, lastSeenAt: new Date("2026-04-09T00:00:00.000Z") }),
      ],
      histogramBuckets: [{ bucket: "2026-04-09", count: 8 }],
      totalTraces: 20,
    })
    const { repository: issueProjectionRepository, calls } = createIssueProjectionRepository([
      {
        uuid: secondIssue.uuid,
        title: secondIssue.name,
        description: secondIssue.description,
        score: 0.9,
      },
      {
        uuid: firstIssue.uuid,
        title: firstIssue.name,
        description: firstIssue.description,
        score: 0.6,
      },
    ])

    const result = await Effect.runPromise(
      listIssuesUseCase({
        organizationId,
        projectId,
        search: {
          query: "search query",
          normalizedEmbedding: [0.1, 0.9],
        },
        now,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(IssueRepository, issueRepository),
            Layer.succeed(EvaluationRepository, evaluationRepository),
            Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
            Layer.succeed(IssueProjectionRepository, issueProjectionRepository),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
          ),
        ),
      ),
    )

    expect(calls).toEqual([
      {
        query: "search query",
        vector: [0.1, 0.9],
      },
    ])
    expect(result.items.map((item) => item.id)).toEqual([secondIssue.id, firstIssue.id])
    expect(result.items.map((item) => item.similarityScore)).toEqual([0.9, 0.6])
    expect(histogramInputs[0]?.issueIds).toEqual([firstIssue.id, secondIssue.id])
  })

  it("sorts by occurrences and paginates visible rows", async () => {
    const now = new Date("2026-04-10T12:00:00.000Z")
    const firstIssue = makeIssue({
      id: IssueId("g".repeat(24)),
      uuid: "77777777-7777-4777-8777-777777777777",
      name: "First issue",
    })
    const secondIssue = makeIssue({
      id: IssueId("h".repeat(24)),
      uuid: "88888888-8888-4888-8888-888888888888",
      name: "Second issue",
    })
    const thirdIssue = makeIssue({
      id: IssueId("j".repeat(24)),
      uuid: "99999999-9999-4999-8999-999999999999",
      name: "Third issue",
    })

    const { repository: issueRepository } = createFakeIssueRepository([firstIssue, secondIssue, thirdIssue])
    const { repository: evaluationRepository, listByIssueIdsCalls } = createEvaluationRepository([
      makeEvaluation({
        id: EvaluationId("3".repeat(24)),
        issueId: secondIssue.id,
        name: "Second issue evaluation",
      }),
    ])
    const { repository: scoreAnalyticsRepository } = createScoreAnalyticsRepository({
      windowMetrics: [
        makeWindowMetric({ issueId: firstIssue.id, occurrences: 3, lastSeenAt: new Date("2026-04-09T00:00:00.000Z") }),
        makeWindowMetric({ issueId: secondIssue.id, occurrences: 1, lastSeenAt: new Date("2026-04-08T00:00:00.000Z") }),
        makeWindowMetric({ issueId: thirdIssue.id, occurrences: 2, lastSeenAt: new Date("2026-04-07T00:00:00.000Z") }),
      ],
      fullHistoryOccurrences: [
        makeOccurrence({ issueId: firstIssue.id }),
        makeOccurrence({ issueId: secondIssue.id }),
        makeOccurrence({ issueId: thirdIssue.id }),
      ],
      trendSeries: [
        {
          issueId: secondIssue.id,
          buckets: [{ bucket: "2026-04-08", count: 1 }],
        },
      ],
      totalTraces: 5,
    })
    const { repository: issueProjectionRepository } = createIssueProjectionRepository([])

    const result = await Effect.runPromise(
      listIssuesUseCase({
        organizationId,
        projectId,
        sort: {
          field: "occurrences",
          direction: "asc",
        },
        limit: 1,
        offset: 0,
        now,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(IssueRepository, issueRepository),
            Layer.succeed(EvaluationRepository, evaluationRepository),
            Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
            Layer.succeed(IssueProjectionRepository, issueProjectionRepository),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
          ),
        ),
      ),
    )

    expect(result.totalCount).toBe(3)
    expect(result.hasMore).toBe(true)
    expect(result.items.map((item) => item.id)).toEqual([secondIssue.id])
    expect(result.items[0]?.evaluations.map((evaluation) => evaluation.id)).toEqual([EvaluationId("3".repeat(24))])
    expect(listByIssueIdsCalls).toEqual([[secondIssue.id]])
  })

  it("honors ascending last-seen sorting", async () => {
    const now = new Date("2026-04-10T12:00:00.000Z")
    const oldestIssue = makeIssue({
      id: IssueId("k".repeat(24)),
      uuid: "12121212-1212-4121-8121-121212121212",
      name: "Oldest issue",
    })
    const newestIssue = makeIssue({
      id: IssueId("l".repeat(24)),
      uuid: "34343434-3434-4343-8343-343434343434",
      name: "Newest issue",
    })

    const { repository: issueRepository } = createFakeIssueRepository([oldestIssue, newestIssue])
    const { repository: evaluationRepository } = createEvaluationRepository()
    const { repository: scoreAnalyticsRepository } = createScoreAnalyticsRepository({
      windowMetrics: [
        makeWindowMetric({
          issueId: oldestIssue.id,
          occurrences: 2,
          lastSeenAt: new Date("2026-04-02T00:00:00.000Z"),
        }),
        makeWindowMetric({
          issueId: newestIssue.id,
          occurrences: 1,
          lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
        }),
      ],
      fullHistoryOccurrences: [
        makeOccurrence({ issueId: oldestIssue.id, lastSeenAt: new Date("2026-04-02T00:00:00.000Z") }),
        makeOccurrence({ issueId: newestIssue.id, lastSeenAt: new Date("2026-04-09T00:00:00.000Z") }),
      ],
      totalTraces: 4,
    })
    const { repository: issueProjectionRepository } = createIssueProjectionRepository([])

    const result = await Effect.runPromise(
      listIssuesUseCase({
        organizationId,
        projectId,
        sort: {
          field: "lastSeen",
          direction: "asc",
        },
        now,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(IssueRepository, issueRepository),
            Layer.succeed(EvaluationRepository, evaluationRepository),
            Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
            Layer.succeed(IssueProjectionRepository, issueProjectionRepository),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
          ),
        ),
      ),
    )

    expect(result.items.map((item) => item.id)).toEqual([oldestIssue.id, newestIssue.id])
  })
})
