import {
  defaultEvaluationTrigger,
  type Evaluation,
  EvaluationRepository,
  type EvaluationRepositoryShape,
  emptyEvaluationAlignment,
} from "@domain/evaluations"
import { type IssueOccurrenceAggregate, type IssueWindowMetric, ScoreAnalyticsRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import { ChSqlClient, EvaluationId, IssueId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { type Issue, IssueState } from "../entities/issue.ts"
import { createIssueCentroid } from "../helpers.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueRepository } from "../testing/fake-issue-repository.ts"
import { listIssuesUseCase } from "./list-issues.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: IssueId("i".repeat(24)),
  organizationId: organizationId as string,
  projectId: projectId as string,
  slug: "test-issue",
  name: "Issue candidate",
  description: "Repeated assistant failure",
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

// `aggregateByIssues` is invoked with the operator-projected `issueIds`, so
// the fake filters the seeded full-history occurrences by what was asked for.
const aggregateOccurrences =
  (seed: readonly IssueOccurrenceAggregate[]) => (input: { readonly issueIds: readonly string[] }) =>
    Effect.sync(() => seed.filter((occurrence) => input.issueIds.includes(occurrence.issueId)))

let traceCount = 0
const provideTraceRepository = Layer.succeed(
  TraceRepository,
  createFakeTraceRepository({
    countByProjectId: () => Effect.sync(() => traceCount),
  }).repository,
)

const createIssueSearch = (
  candidates: readonly {
    issueId: IssueId
    name: string
    description: string
    score: number
  }[],
) => {
  const calls: Array<{
    query: string
    normalizedEmbedding: readonly number[]
  }> = []

  return {
    calls,
    hybridSearch: (input: { readonly query: string; readonly normalizedEmbedding: readonly number[] }) =>
      Effect.sync(() => {
        calls.push({
          query: input.query,
          normalizedEmbedding: input.normalizedEmbedding,
        })
        return candidates
      }),
  }
}

describe("listIssuesUseCase", () => {
  beforeEach(() => {
    traceCount = 0
  })

  it("returns the empty issue shape without querying ClickHouse when the project has no issues", async () => {
    const now = new Date("2026-04-10T00:00:00.000Z")
    const { repository: issueRepository } = createFakeIssueRepository([])
    const { repository: evaluationRepository } = createEvaluationRepository()
    const windowMetricInputs: unknown[] = []
    const aggregateInputs: unknown[] = []
    const histogramInputs: unknown[] = []
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listIssueWindowMetrics: (input) =>
        Effect.sync(() => {
          windowMetricInputs.push(input)
          return []
        }),
      aggregateByIssues: (input) =>
        Effect.sync(() => {
          aggregateInputs.push(input)
          return []
        }),
      histogramByIssues: (input) =>
        Effect.sync(() => {
          histogramInputs.push(input)
          return []
        }),
    })
    let traceCountCalls = 0
    const { repository: traceRepository } = createFakeTraceRepository({
      countByProjectId: () =>
        Effect.sync(() => {
          traceCountCalls += 1
          return 0
        }),
    })

    const result = await Effect.runPromise(
      listIssuesUseCase({ organizationId, projectId, now }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(IssueRepository, issueRepository),
            Layer.succeed(EvaluationRepository, evaluationRepository),
            Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
            Layer.succeed(TraceRepository, traceRepository),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
          ),
        ),
      ),
    )

    expect(result.items).toEqual([])
    expect(result.totalCount).toBe(0)
    expect(result.analytics.totalTraces).toBe(0)
    expect(result.analytics.histogram.length).toBeGreaterThan(0)
    expect(windowMetricInputs).toEqual([])
    expect(aggregateInputs).toEqual([])
    expect(histogramInputs).toEqual([])
    expect(traceCountCalls).toBe(0)
  })

  it("enriches the default listing with derived lifecycle states", async () => {
    const now = new Date("2026-04-10T00:00:00.000Z")
    const newestIssue = makeIssue({
      id: IssueId("aaaaaaaaaaaaaaaaaaaaaaaa"),
      createdAt: new Date("2026-04-07T08:00:00.000Z"),
      updatedAt: new Date("2026-04-07T08:00:00.000Z"),
      clusteredAt: new Date("2026-04-07T08:00:00.000Z"),
    })
    const regressedIssue = makeIssue({
      id: IssueId("bbbbbbbbbbbbbbbbbbbbbbbb"),
      resolvedAt: new Date("2026-04-01T12:00:00.000Z"),
      createdAt: new Date("2026-03-20T08:00:00.000Z"),
      updatedAt: new Date("2026-03-20T08:00:00.000Z"),
      clusteredAt: new Date("2026-03-20T08:00:00.000Z"),
    })
    const ignoredIssue = makeIssue({
      id: IssueId("cccccccccccccccccccccccc"),
      ignoredAt: new Date("2026-04-02T12:00:00.000Z"),
      createdAt: new Date("2026-03-10T08:00:00.000Z"),
      updatedAt: new Date("2026-03-10T08:00:00.000Z"),
      clusteredAt: new Date("2026-03-10T08:00:00.000Z"),
    })

    const { repository: issueRepository } = createFakeIssueRepository([ignoredIssue, regressedIssue, newestIssue])
    const { repository: evaluationRepository, listByIssueIdsCalls } = createEvaluationRepository()
    const fullHistoryOccurrences: readonly IssueOccurrenceAggregate[] = [
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
    ]
    const windowMetricInputs: unknown[] = []
    const aggregateInputs: unknown[] = []
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listIssueWindowMetrics: (input) =>
        Effect.sync(() => {
          windowMetricInputs.push(input)
          return [
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
          ]
        }),
      aggregateByIssues: (input) =>
        Effect.sync(() => {
          aggregateInputs.push(input)
          return fullHistoryOccurrences.filter((occurrence) => input.issueIds.includes(occurrence.issueId))
        }),
    })
    const { calls } = createIssueSearch([])

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
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
            provideTraceRepository,
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
        // The regressed lifecycle state is no longer derived from
        // (resolvedAt + lastSeenAt) — regression is reified at write time
        // (which clears resolvedAt) and lives in alert_incidents. An issue
        // with resolvedAt still set derives as Resolved. The "regressed
        // recently" view is a UI follow-up against alert_incidents.
        id: regressedIssue.id,
        states: [IssueState.Resolved],
      },
    ])
    expect(result.analytics.counts.regressedIssues).toBe(0)
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
      name: "Active issue",
    })
    const regressedIssue = makeIssue({
      id: IssueId("b".repeat(24)),
      name: "Regressed issue",
      resolvedAt: new Date("2026-04-05T00:00:00.000Z"),
    })
    const archivedIssue = makeIssue({
      id: IssueId("c".repeat(24)),
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
    const histogramInputs: Array<{
      issueIds: readonly string[]
      from: Date
      to: Date
    }> = []
    const trendInputs: Array<{
      issueIds: readonly string[]
      from: Date
      to: Date
    }> = []
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listIssueWindowMetrics: () =>
        Effect.succeed([
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
        ]),
      aggregateByIssues: aggregateOccurrences([
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
      ]),
      histogramByIssues: ({ issueIds, timeRange }) =>
        Effect.sync(() => {
          histogramInputs.push({
            issueIds,
            from: timeRange.from ?? new Date(0),
            to: timeRange.to ?? new Date(0),
          })
          return [
            { bucket: "2026-04-09", count: 3 },
            { bucket: "2026-04-10", count: 2 },
          ]
        }),
      trendByIssues: ({ issueIds, timeRange }) =>
        Effect.sync(() => {
          trendInputs.push({
            issueIds,
            from: timeRange.from ?? new Date(0),
            to: timeRange.to ?? new Date(0),
          })
          return [
            { issueId: activeIssue.id, buckets: [{ bucket: "2026-04-09", count: 5 }] },
            { issueId: regressedIssue.id, buckets: [{ bucket: "2026-04-08", count: 4 }] },
          ]
        }),
    })
    const { calls } = createIssueSearch([])
    traceCount = 10

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
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
            provideTraceRepository,
          ),
        ),
      ),
    )

    expect(calls).toEqual([])
    // Regression is no longer derived; the previously "regressed" fixture
    // (resolvedAt still set in this fixture) now derives as Resolved and
    // therefore drops out of the lifecycleGroup="active" page along with
    // the archived issue. Regression history is reified at write time and
    // tracked via alert_incidents; UI hydration of "regressed recently"
    // will use that table as a follow-up.
    expect(result.analytics.counts.resolvedIssues).toBe(2)
    expect(result.analytics.counts.regressedIssues).toBe(0)
    expect(result.analytics.counts.ongoingIssues).toBe(1)
    expect(result.analytics.counts.seenOccurrences).toBe(16)
    expect(result.items.map((item) => item.states)).toEqual([[IssueState.Ongoing]])
    expect(result.items.map((item) => item.id)).toEqual([activeIssue.id])
    expect(result.occurrencesSum).toBe(5)
    expect(result.items[0]?.affectedTracesPercent).toBe(0.5)
    expect(result.items[0]?.evaluations.map((evaluation) => evaluation.id)).toEqual([EvaluationId("1".repeat(24))])
    // Adaptive bucketing over 7 days picks 4h buckets → 6 bars/day × 7 days = 42.
    expect(result.analytics.histogram).toHaveLength(42)
    expect(result.analytics.histogramBucketSeconds).toBe(4 * 60 * 60)
    // Per-issue trend in the list keeps the daily 14-bar mini-bar.
    expect(result.items[0]?.trend).toHaveLength(14)
    expect(listByIssueIdsCalls).toEqual([[activeIssue.id]])
    expect(histogramInputs[0]?.issueIds).toEqual([activeIssue.id, regressedIssue.id, archivedIssue.id])
    expect(histogramInputs[0]?.from.toISOString()).toBe("2026-04-04T00:00:00.000Z")
    expect(histogramInputs[0]?.to.toISOString()).toBe("2026-04-10T23:59:59.999Z")
    expect(trendInputs[0]?.issueIds).toEqual([activeIssue.id])
    expect(trendInputs[0]?.from.toISOString()).toBe("2026-03-28T00:00:00.000Z")
    expect(trendInputs[0]?.to.toISOString()).toBe("2026-04-10T23:59:59.999Z")
  })

  it("attaches per-issue tag aggregates to the visible page", async () => {
    const now = new Date("2026-04-10T00:00:00.000Z")
    const taggedIssue = makeIssue({
      id: IssueId("a".repeat(24)),
    })
    const untaggedIssue = makeIssue({
      id: IssueId("b".repeat(24)),
    })

    const { repository: issueRepository } = createFakeIssueRepository([taggedIssue, untaggedIssue])
    const { repository: evaluationRepository } = createEvaluationRepository()
    const tagsInputs: Array<{
      issueIds: readonly string[]
      from: Date
      to: Date | undefined
    }> = []
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listIssueWindowMetrics: () =>
        Effect.succeed([
          makeWindowMetric({ issueId: taggedIssue.id, occurrences: 1 }),
          makeWindowMetric({ issueId: untaggedIssue.id, occurrences: 1 }),
        ]),
      aggregateByIssues: aggregateOccurrences([
        makeOccurrence({ issueId: taggedIssue.id }),
        makeOccurrence({ issueId: untaggedIssue.id }),
      ]),
      aggregateTagsByIssues: ({ issueIds, timeRange }) =>
        Effect.sync(() => {
          tagsInputs.push({ issueIds, from: timeRange.from, to: timeRange.to })
          return [{ issueId: taggedIssue.id, tags: ["checkout", "billing"] }].filter((entry) =>
            issueIds.includes(entry.issueId),
          )
        }),
    })
    createIssueSearch([])

    const result = await Effect.runPromise(
      listIssuesUseCase({ organizationId, projectId, now }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(IssueRepository, issueRepository),
            Layer.succeed(EvaluationRepository, evaluationRepository),
            Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
            provideTraceRepository,
          ),
        ),
      ),
    )

    // No operator-selected time range → fallback ~30 days ending at `now`.
    expect(tagsInputs).toHaveLength(1)
    expect(tagsInputs[0]?.issueIds).toEqual([taggedIssue.id, untaggedIssue.id])
    expect(tagsInputs[0]?.to?.toISOString()).toBe(now.toISOString())
    const expectedFrom = new Date(now)
    expectedFrom.setUTCDate(expectedFrom.getUTCDate() - 30)
    expect(tagsInputs[0]?.from?.toISOString()).toBe(expectedFrom.toISOString())

    const tagsByIssueId = new Map(result.items.map((item) => [item.id, item.tags] as const))
    expect(tagsByIssueId.get(taggedIssue.id)).toEqual(["checkout", "billing"])
    expect(tagsByIssueId.get(untaggedIssue.id)).toEqual([])
  })

  it("honors the operator-selected time range when aggregating tags", async () => {
    const now = new Date("2026-04-10T00:00:00.000Z")
    const issue = makeIssue({ id: IssueId("a".repeat(24)) })
    const { repository: issueRepository } = createFakeIssueRepository([issue])
    const { repository: evaluationRepository } = createEvaluationRepository()
    const tagsInputs: Array<{
      issueIds: readonly string[]
      from: Date
      to: Date | undefined
    }> = []
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listIssueWindowMetrics: () => Effect.succeed([makeWindowMetric({ issueId: issue.id })]),
      aggregateByIssues: aggregateOccurrences([makeOccurrence({ issueId: issue.id })]),
      aggregateTagsByIssues: ({ issueIds, timeRange }) =>
        Effect.sync(() => {
          tagsInputs.push({ issueIds, from: timeRange.from, to: timeRange.to })
          return []
        }),
    })
    createIssueSearch([])

    const selectedFrom = new Date("2026-04-01T00:00:00.000Z")
    const selectedTo = new Date("2026-04-08T23:59:59.999Z")

    await Effect.runPromise(
      listIssuesUseCase({
        organizationId,
        projectId,
        now,
        timeRange: { from: selectedFrom, to: selectedTo },
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(IssueRepository, issueRepository),
            Layer.succeed(EvaluationRepository, evaluationRepository),
            Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
            provideTraceRepository,
          ),
        ),
      ),
    )

    expect(tagsInputs[0]?.from?.toISOString()).toBe(selectedFrom.toISOString())
    expect(tagsInputs[0]?.to?.toISOString()).toBe(selectedTo.toISOString())
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
      /**
       * Width adaptively picked from the range — 7 days → 4h (14400s), 27 days → 1d (86400s),
       * 3 days → 2h (7200s). Verified against `pickTraceHistogramBucketSeconds`.
       */
      readonly expectedBucketSeconds: number
      readonly expectedFirstBucketIso: string
      readonly expectedLastBucketIso: string
    }

    const cases: readonly HistogramRangeCase[] = [
      {
        name: "shows the last 7 days ending today when no range is selected",
        timeRange: undefined,
        expectedFromIso: "2026-04-04T00:00:00.000Z",
        expectedToIso: "2026-04-10T23:59:59.999Z",
        expectedBucketSeconds: 4 * 60 * 60,
        expectedFirstBucketIso: "2026-04-04T00:00:00.000Z",
        expectedLastBucketIso: "2026-04-10T20:00:00.000Z",
      },
      {
        name: "shows the range from from through today when only from is selected",
        timeRange: {
          from: new Date("2026-03-15T09:30:00.000Z"),
        },
        expectedFromIso: "2026-03-15T00:00:00.000Z",
        expectedToIso: "2026-04-10T23:59:59.999Z",
        expectedBucketSeconds: 24 * 60 * 60,
        expectedFirstBucketIso: "2026-03-15T00:00:00.000Z",
        expectedLastBucketIso: "2026-04-10T00:00:00.000Z",
      },
      {
        name: "shows the last 7 days ending at to when only to is selected",
        timeRange: {
          to: new Date("2026-04-03T09:30:00.000Z"),
        },
        expectedFromIso: "2026-03-28T00:00:00.000Z",
        expectedToIso: "2026-04-03T23:59:59.999Z",
        expectedBucketSeconds: 4 * 60 * 60,
        expectedFirstBucketIso: "2026-03-28T00:00:00.000Z",
        expectedLastBucketIso: "2026-04-03T20:00:00.000Z",
      },
      {
        name: "shows every selected day when from and to are selected",
        timeRange: {
          from: new Date("2026-04-01T10:15:00.000Z"),
          to: new Date("2026-04-03T21:45:00.000Z"),
        },
        expectedFromIso: "2026-04-01T00:00:00.000Z",
        expectedToIso: "2026-04-03T23:59:59.999Z",
        expectedBucketSeconds: 2 * 60 * 60,
        expectedFirstBucketIso: "2026-04-01T00:00:00.000Z",
        expectedLastBucketIso: "2026-04-03T22:00:00.000Z",
      },
    ]

    it.each(cases)("$name", async ({
      timeRange,
      expectedFromIso,
      expectedToIso,
      expectedBucketSeconds,
      expectedFirstBucketIso,
      expectedLastBucketIso,
    }) => {
      const now = new Date("2026-04-10T12:00:00.000Z")
      const issue = makeIssue({
        id: IssueId("m".repeat(24)),
        name: "Histogram issue",
      })

      const { repository: issueRepository } = createFakeIssueRepository([issue])
      const { repository: evaluationRepository } = createEvaluationRepository()
      const histogramInputs: Array<{
        issueIds: readonly string[]
        from: Date
        to: Date
        bucketSeconds: number
      }> = []
      const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
        listIssueWindowMetrics: () =>
          Effect.succeed([
            makeWindowMetric({
              issueId: issue.id,
              occurrences: 3,
              firstSeenAt: new Date("2026-03-01T00:00:00.000Z"),
              lastSeenAt: new Date("2026-04-10T00:00:00.000Z"),
            }),
          ]),
        aggregateByIssues: aggregateOccurrences([
          makeOccurrence({
            issueId: issue.id,
            totalOccurrences: 3,
            recentOccurrences: 3,
            baselineAvgOccurrences: 1,
            firstSeenAt: new Date("2026-03-01T00:00:00.000Z"),
            lastSeenAt: new Date("2026-04-10T00:00:00.000Z"),
          }),
        ]),
        histogramByIssues: ({ issueIds, timeRange, bucketSeconds }) =>
          Effect.sync(() => {
            histogramInputs.push({
              issueIds,
              from: timeRange.from ?? new Date(0),
              to: timeRange.to ?? new Date(0),
              bucketSeconds,
            })
            return []
          }),
      })
      createIssueSearch([])
      traceCount = 3

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
              Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
              Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
              provideTraceRepository,
            ),
          ),
        ),
      )

      expect(histogramInputs[0]?.issueIds).toEqual([issue.id])
      expect(histogramInputs[0]?.from.toISOString()).toBe(expectedFromIso)
      expect(histogramInputs[0]?.to.toISOString()).toBe(expectedToIso)
      expect(histogramInputs[0]?.bucketSeconds).toBe(expectedBucketSeconds)
      expect(result.analytics.histogramBucketSeconds).toBe(expectedBucketSeconds)

      const histogram = result.analytics.histogram
      expect(histogram.length).toBeGreaterThan(0)
      expect(histogram[0]?.bucket).toBe(expectedFirstBucketIso)
      expect(histogram[histogram.length - 1]?.bucket).toBe(expectedLastBucketIso)
      // Every bucket key is aligned to the chosen interval — no drift between scaffold rows.
      const widthMs = expectedBucketSeconds * 1000
      const firstMs = Date.parse(expectedFirstBucketIso)
      for (const [index, bucket] of histogram.entries()) {
        expect(Date.parse(bucket.bucket)).toBe(firstMs + index * widthMs)
      }
    })
  })

  it("intersects search candidates and uses similarity as the final default-sort tie-breaker", async () => {
    const now = new Date("2026-04-10T12:00:00.000Z")
    const firstIssue = makeIssue({
      id: IssueId("d".repeat(24)),
      name: "First search match",
    })
    const secondIssue = makeIssue({
      id: IssueId("e".repeat(24)),
      name: "Second search match",
    })
    const thirdIssue = makeIssue({
      id: IssueId("f".repeat(24)),
      name: "Filtered by search",
    })

    const issueSearch = createIssueSearch([
      {
        issueId: secondIssue.id,
        name: secondIssue.name,
        description: secondIssue.description,
        score: 0.9,
      },
      {
        issueId: firstIssue.id,
        name: firstIssue.name,
        description: firstIssue.description,
        score: 0.6,
      },
    ])
    const { repository: issueRepository } = createFakeIssueRepository([firstIssue, secondIssue, thirdIssue], {
      hybridSearch: issueSearch.hybridSearch,
    })
    const { repository: evaluationRepository } = createEvaluationRepository()
    const histogramInputs: Array<{ issueIds: readonly string[] }> = []
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listIssueWindowMetrics: () =>
        Effect.succeed([
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
        ]),
      aggregateByIssues: aggregateOccurrences([
        makeOccurrence({
          issueId: firstIssue.id,
          lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
        }),
        makeOccurrence({
          issueId: secondIssue.id,
          lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
        }),
      ]),
      histogramByIssues: ({ issueIds }) =>
        Effect.sync(() => {
          histogramInputs.push({ issueIds })
          return [{ bucket: "2026-04-09", count: 8 }]
        }),
    })
    const { calls } = issueSearch
    traceCount = 20

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
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
            provideTraceRepository,
          ),
        ),
      ),
    )

    expect(calls).toEqual([
      {
        query: "search query",
        normalizedEmbedding: [0.1, 0.9],
      },
    ])
    expect(result.items.map((item) => item.id)).toEqual([secondIssue.id, firstIssue.id])
    expect(result.items.map((item) => item.similarityScore)).toEqual([0.9, 0.6])
    expect(histogramInputs[0]?.issueIds).toEqual([secondIssue.id, firstIssue.id])
  })

  it("sorts by occurrences and paginates visible rows", async () => {
    const now = new Date("2026-04-10T12:00:00.000Z")
    const firstIssue = makeIssue({
      id: IssueId("g".repeat(24)),
      name: "First issue",
    })
    const secondIssue = makeIssue({
      id: IssueId("h".repeat(24)),
      name: "Second issue",
    })
    const thirdIssue = makeIssue({
      id: IssueId("j".repeat(24)),
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
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listIssueWindowMetrics: () =>
        Effect.succeed([
          makeWindowMetric({
            issueId: firstIssue.id,
            occurrences: 3,
            lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
          }),
          makeWindowMetric({
            issueId: secondIssue.id,
            occurrences: 1,
            lastSeenAt: new Date("2026-04-08T00:00:00.000Z"),
          }),
          makeWindowMetric({
            issueId: thirdIssue.id,
            occurrences: 2,
            lastSeenAt: new Date("2026-04-07T00:00:00.000Z"),
          }),
        ]),
      aggregateByIssues: aggregateOccurrences([
        makeOccurrence({ issueId: firstIssue.id }),
        makeOccurrence({ issueId: secondIssue.id }),
        makeOccurrence({ issueId: thirdIssue.id }),
      ]),
      trendByIssues: () =>
        Effect.succeed([
          {
            issueId: secondIssue.id,
            buckets: [{ bucket: "2026-04-08", count: 1 }],
          },
        ]),
    })
    createIssueSearch([])
    traceCount = 5

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
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
            provideTraceRepository,
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
      name: "Oldest issue",
    })
    const newestIssue = makeIssue({
      id: IssueId("l".repeat(24)),
      name: "Newest issue",
    })

    const { repository: issueRepository } = createFakeIssueRepository([oldestIssue, newestIssue])
    const { repository: evaluationRepository } = createEvaluationRepository()
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listIssueWindowMetrics: () =>
        Effect.succeed([
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
        ]),
      aggregateByIssues: aggregateOccurrences([
        makeOccurrence({
          issueId: oldestIssue.id,
          lastSeenAt: new Date("2026-04-02T00:00:00.000Z"),
        }),
        makeOccurrence({
          issueId: newestIssue.id,
          lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
        }),
      ]),
    })
    createIssueSearch([])
    traceCount = 4

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
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
            provideTraceRepository,
          ),
        ),
      ),
    )

    expect(result.items.map((item) => item.id)).toEqual([oldestIssue.id, newestIssue.id])
  })
})
