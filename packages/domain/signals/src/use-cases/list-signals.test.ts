import {
  defaultEvaluationTrigger,
  type Evaluation,
  EvaluationRepository,
  type EvaluationRepositoryShape,
  emptyEvaluationAlignment,
} from "@domain/evaluations"
import { ScoreAnalyticsRepository, type SignalOccurrenceAggregate, type SignalWindowMetric } from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import { ChSqlClient, EvaluationId, OrganizationId, ProjectId, SignalId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { type Signal, SignalState } from "../entities/signal.ts"
import { createSignalCentroid } from "../helpers.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { type ListSignalsInput, listSignalsUseCase } from "./list-signals.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))

const makeSignal = (overrides: Partial<Signal> = {}): Signal => ({
  id: SignalId("i".repeat(24)),
  organizationId: organizationId as string,
  projectId: projectId as string,
  slug: "test-issue",
  name: "Signal candidate",
  description: "Repeated assistant failure",
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

const makeEvaluation = (overrides: Partial<Evaluation> = {}): Evaluation => ({
  id: EvaluationId("e".repeat(24)),
  organizationId: organizationId as string,
  projectId: projectId as string,
  signalId: SignalId("i".repeat(24)),
  name: "Monitor issue",
  description: "Regression monitor",
  script: "return { passed: false }",
  trigger: defaultEvaluationTrigger(),
  alignment: emptyEvaluationAlignment("hash-v1"),
  alignedAt: new Date("2026-04-01T00:00:00.000Z"),
  membershipOnPass: false,
  archivedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-04-01T00:00:00.000Z"),
  updatedAt: new Date("2026-04-01T00:00:00.000Z"),
  ...overrides,
})

const makeWindowMetric = (overrides: Partial<SignalWindowMetric> = {}): SignalWindowMetric => ({
  signalId: SignalId("i".repeat(24)),
  occurrences: 1,
  firstSeenAt: new Date("2026-04-01T00:00:00.000Z"),
  lastSeenAt: new Date("2026-04-01T00:00:00.000Z"),
  ...overrides,
})

const makeOccurrence = (overrides: Partial<SignalOccurrenceAggregate> = {}): SignalOccurrenceAggregate => ({
  signalId: SignalId("i".repeat(24)),
  totalOccurrences: 10,
  recentOccurrences: 2,
  baselineAvgOccurrences: 1,
  firstSeenAt: new Date("2026-03-01T00:00:00.000Z"),
  lastSeenAt: new Date("2026-04-01T00:00:00.000Z"),
  ...overrides,
})

const createEvaluationRepository = (seed: readonly Evaluation[] = []) => {
  const listBySignalIdsCalls: Array<readonly string[]> = []
  const repository: EvaluationRepositoryShape = {
    findById: () => Effect.die("Unexpected EvaluationRepository.findById in listSignalsUseCase test"),
    save: () => Effect.die("Unexpected EvaluationRepository.save in listSignalsUseCase test"),
    listByProjectId: () => Effect.die("Unexpected EvaluationRepository.listByProjectId in listSignalsUseCase test"),
    listBySignalId: () => Effect.die("Unexpected EvaluationRepository.listBySignalId in listSignalsUseCase test"),
    listBySignalIds: ({ signalIds, options }) =>
      Effect.sync(() => {
        listBySignalIdsCalls.push(signalIds)
        const filteredSeed = seed.filter((evaluation) => {
          if (!signalIds.some((signalId) => signalId === evaluation.signalId)) {
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
    archive: () => Effect.die("Unexpected EvaluationRepository.archive in listSignalsUseCase test"),
    unarchive: () => Effect.die("Unexpected EvaluationRepository.unarchive in listSignalsUseCase test"),
    softDelete: () => Effect.die("Unexpected EvaluationRepository.softDelete in listSignalsUseCase test"),
    softDeleteBySignalId: () =>
      Effect.die("Unexpected EvaluationRepository.softDeleteBySignalId in listSignalsUseCase test"),
  }

  return { repository, listBySignalIdsCalls }
}

// `aggregateBySignals` is invoked with the operator-projected `signalIds`, so
// the fake filters the seeded full-history occurrences by what was asked for.
const aggregateOccurrences =
  (seed: readonly SignalOccurrenceAggregate[]) => (input: { readonly signalIds: readonly string[] }) =>
    Effect.sync(() => seed.filter((occurrence) => input.signalIds.includes(occurrence.signalId)))

let traceCount = 0
const provideTraceRepository = Layer.succeed(
  TraceRepository,
  createFakeTraceRepository({
    countByProjectId: () => Effect.sync(() => traceCount),
  }).repository,
)

const createSignalSearch = (
  candidates: readonly {
    signalId: SignalId
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

describe("listSignalsUseCase", () => {
  beforeEach(() => {
    traceCount = 0
  })

  it("returns the empty issue shape without querying ClickHouse when the project has no issues", async () => {
    const now = new Date("2026-04-10T00:00:00.000Z")
    const { repository: signalRepository } = createFakeSignalRepository([])
    const { repository: evaluationRepository } = createEvaluationRepository()
    const windowMetricInputs: unknown[] = []
    const aggregateInputs: unknown[] = []
    const histogramInputs: unknown[] = []
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listSignalWindowMetrics: (input) =>
        Effect.sync(() => {
          windowMetricInputs.push(input)
          return []
        }),
      aggregateBySignals: (input) =>
        Effect.sync(() => {
          aggregateInputs.push(input)
          return []
        }),
      histogramBySignals: (input) =>
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
      listSignalsUseCase({ organizationId, projectId, now }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(SignalRepository, signalRepository),
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
    expect(result.hasAnySignals).toBe(false)
    expect(result.priorityCounts).toEqual({ urgent: 0, high: 0, medium: 0, low: 0, none: 0 })
    expect(result.assigneeCounts).toEqual({})
    expect(result.analytics.totalTraces).toBe(0)
    expect(result.analytics.histogram.length).toBeGreaterThan(0)
    expect(windowMetricInputs).toEqual([])
    expect(aggregateInputs).toEqual([])
    expect(histogramInputs).toEqual([])
    expect(traceCountCalls).toBe(0)
  })

  it("reports project issue existence when the selected lifecycle group has no visible rows", async () => {
    const now = new Date("2026-04-10T00:00:00.000Z")
    const resolvedSignal = makeSignal({
      id: SignalId("r".repeat(24)),
      resolvedAt: new Date("2026-04-08T00:00:00.000Z"),
    })
    const { repository: signalRepository } = createFakeSignalRepository([resolvedSignal])
    const { repository: evaluationRepository, listBySignalIdsCalls } = createEvaluationRepository()
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listSignalWindowMetrics: () =>
        Effect.succeed([
          makeWindowMetric({
            signalId: resolvedSignal.id,
            occurrences: 3,
            firstSeenAt: new Date("2026-04-07T00:00:00.000Z"),
            lastSeenAt: new Date("2026-04-08T00:00:00.000Z"),
          }),
        ]),
      aggregateBySignals: aggregateOccurrences([
        makeOccurrence({
          signalId: resolvedSignal.id,
          totalOccurrences: 3,
          recentOccurrences: 0,
          baselineAvgOccurrences: 0,
          firstSeenAt: new Date("2026-04-07T00:00:00.000Z"),
          lastSeenAt: new Date("2026-04-08T00:00:00.000Z"),
        }),
      ]),
    })

    const result = await Effect.runPromise(
      listSignalsUseCase({
        organizationId,
        projectId,
        lifecycleGroup: "active",
        now,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(SignalRepository, signalRepository),
            Layer.succeed(EvaluationRepository, evaluationRepository),
            Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
            provideTraceRepository,
          ),
        ),
      ),
    )

    expect(result.items).toEqual([])
    expect(result.totalCount).toBe(0)
    expect(result.hasAnySignals).toBe(true)
    expect(result.analytics.counts.resolvedSignals).toBe(1)
    expect(listBySignalIdsCalls).toEqual([])
  })

  it("enriches the default listing with derived lifecycle states", async () => {
    const now = new Date("2026-04-10T00:00:00.000Z")
    const newestSignal = makeSignal({
      id: SignalId("aaaaaaaaaaaaaaaaaaaaaaaa"),
      createdAt: new Date("2026-04-07T08:00:00.000Z"),
      updatedAt: new Date("2026-04-07T08:00:00.000Z"),
      clusteredAt: new Date("2026-04-07T08:00:00.000Z"),
    })
    const regressedSignal = makeSignal({
      id: SignalId("bbbbbbbbbbbbbbbbbbbbbbbb"),
      resolvedAt: new Date("2026-04-01T12:00:00.000Z"),
      createdAt: new Date("2026-03-20T08:00:00.000Z"),
      updatedAt: new Date("2026-03-20T08:00:00.000Z"),
      clusteredAt: new Date("2026-03-20T08:00:00.000Z"),
    })
    const ignoredSignal = makeSignal({
      id: SignalId("cccccccccccccccccccccccc"),
      ignoredAt: new Date("2026-04-02T12:00:00.000Z"),
      createdAt: new Date("2026-03-10T08:00:00.000Z"),
      updatedAt: new Date("2026-03-10T08:00:00.000Z"),
      clusteredAt: new Date("2026-03-10T08:00:00.000Z"),
    })

    const { repository: signalRepository } = createFakeSignalRepository([ignoredSignal, regressedSignal, newestSignal])
    const { repository: evaluationRepository, listBySignalIdsCalls } = createEvaluationRepository()
    const fullHistoryOccurrences: readonly SignalOccurrenceAggregate[] = [
      makeOccurrence({
        signalId: newestSignal.id,
        totalOccurrences: 4,
        recentOccurrences: 4,
        baselineAvgOccurrences: 2,
        firstSeenAt: new Date("2026-04-07T08:00:00.000Z"),
        lastSeenAt: new Date("2026-04-09T20:00:00.000Z"),
      }),
      makeOccurrence({
        signalId: regressedSignal.id,
        totalOccurrences: 6,
        recentOccurrences: 0,
        baselineAvgOccurrences: 0,
        firstSeenAt: new Date("2026-03-20T08:00:00.000Z"),
        lastSeenAt: new Date("2026-04-05T08:00:00.000Z"),
      }),
      makeOccurrence({
        signalId: ignoredSignal.id,
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
      listSignalWindowMetrics: (input) =>
        Effect.sync(() => {
          windowMetricInputs.push(input)
          return [
            makeWindowMetric({
              signalId: newestSignal.id,
              occurrences: 4,
              firstSeenAt: new Date("2026-04-07T08:00:00.000Z"),
              lastSeenAt: new Date("2026-04-09T20:00:00.000Z"),
            }),
            makeWindowMetric({
              signalId: regressedSignal.id,
              occurrences: 6,
              firstSeenAt: new Date("2026-03-20T08:00:00.000Z"),
              lastSeenAt: new Date("2026-04-05T08:00:00.000Z"),
            }),
            makeWindowMetric({
              signalId: ignoredSignal.id,
              occurrences: 2,
              firstSeenAt: new Date("2026-03-10T08:00:00.000Z"),
              lastSeenAt: new Date("2026-04-02T08:00:00.000Z"),
            }),
          ]
        }),
      aggregateBySignals: (input) =>
        Effect.sync(() => {
          aggregateInputs.push(input)
          return fullHistoryOccurrences.filter((occurrence) => input.signalIds.includes(occurrence.signalId))
        }),
    })
    const { calls } = createSignalSearch([])

    const result = await Effect.runPromise(
      listSignalsUseCase({
        organizationId,
        projectId,
        limit: 2,
        offset: 0,
        now,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(SignalRepository, signalRepository),
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
        signalIds: [newestSignal.id, regressedSignal.id, ignoredSignal.id],
      },
    ])
    expect(listBySignalIdsCalls).toEqual([[newestSignal.id, regressedSignal.id]])
    expect(result.items.map((issue) => ({ id: issue.id, states: issue.states }))).toEqual([
      {
        id: newestSignal.id,
        states: [SignalState.New],
      },
      {
        // The regressed lifecycle state is no longer derived from
        // (resolvedAt + lastSeenAt) — regression is reified at write time
        // (which clears resolvedAt) and lives in alert_incidents. An issue
        // with resolvedAt still set derives as Resolved. The "regressed
        // recently" view is a UI follow-up against alert_incidents.
        id: regressedSignal.id,
        states: [SignalState.Resolved],
      },
    ])
    expect(result.analytics.counts.regressedSignals).toBe(0)
    expect(result.analytics.counts.seenOccurrences).toBe(12)
    expect(result.totalCount).toBe(3)
    expect(result.hasAnySignals).toBe(true)
    expect(result.hasMore).toBe(true)
    expect(result.limit).toBe(2)
    expect(result.offset).toBe(0)
  })

  it("keeps analytics independent from the lifecycle tab and hydrates only visible signal ids", async () => {
    const now = new Date("2026-04-10T12:00:00.000Z")
    const activeSignal = makeSignal({
      id: SignalId("a".repeat(24)),
      name: "Active issue",
    })
    const regressedSignal = makeSignal({
      id: SignalId("b".repeat(24)),
      name: "Regressed issue",
      resolvedAt: new Date("2026-04-05T00:00:00.000Z"),
    })
    const archivedSignal = makeSignal({
      id: SignalId("c".repeat(24)),
      name: "Archived issue",
      resolvedAt: new Date("2026-04-07T00:00:00.000Z"),
    })

    const { repository: signalRepository } = createFakeSignalRepository([activeSignal, regressedSignal, archivedSignal])
    const { repository: evaluationRepository, listBySignalIdsCalls } = createEvaluationRepository([
      makeEvaluation({
        id: EvaluationId("1".repeat(24)),
        signalId: activeSignal.id,
        name: "Active monitor",
      }),
      makeEvaluation({
        id: EvaluationId("9".repeat(24)),
        signalId: activeSignal.id,
        name: "Archived monitor for active issue",
        archivedAt: new Date("2026-04-09T00:00:00.000Z"),
      }),
      makeEvaluation({
        id: EvaluationId("2".repeat(24)),
        signalId: archivedSignal.id,
        name: "Archived monitor",
      }),
    ])
    const histogramInputs: Array<{
      signalIds: readonly string[]
      from: Date
      to: Date
    }> = []
    const trendInputs: Array<{
      signalIds: readonly string[]
      from: Date
      to: Date
    }> = []
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listSignalWindowMetrics: () =>
        Effect.succeed([
          makeWindowMetric({
            signalId: activeSignal.id,
            occurrences: 5,
            firstSeenAt: new Date("2026-03-01T00:00:00.000Z"),
            lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
          }),
          makeWindowMetric({
            signalId: regressedSignal.id,
            occurrences: 4,
            firstSeenAt: new Date("2026-03-02T00:00:00.000Z"),
            lastSeenAt: new Date("2026-04-08T00:00:00.000Z"),
          }),
          makeWindowMetric({
            signalId: archivedSignal.id,
            occurrences: 7,
            firstSeenAt: new Date("2026-03-03T00:00:00.000Z"),
            lastSeenAt: new Date("2026-04-04T00:00:00.000Z"),
          }),
        ]),
      aggregateBySignals: aggregateOccurrences([
        makeOccurrence({
          signalId: activeSignal.id,
          recentOccurrences: 3,
          baselineAvgOccurrences: 1,
          lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
        }),
        makeOccurrence({
          signalId: regressedSignal.id,
          recentOccurrences: 1,
          baselineAvgOccurrences: 0,
          lastSeenAt: new Date("2026-04-08T00:00:00.000Z"),
        }),
        makeOccurrence({
          signalId: archivedSignal.id,
          recentOccurrences: 0,
          baselineAvgOccurrences: 0,
          lastSeenAt: new Date("2026-04-04T00:00:00.000Z"),
        }),
      ]),
      histogramBySignals: ({ signalIds, timeRange }) =>
        Effect.sync(() => {
          histogramInputs.push({
            signalIds,
            from: timeRange.from ?? new Date(0),
            to: timeRange.to ?? new Date(0),
          })
          return [
            { bucket: "2026-04-09", count: 3 },
            { bucket: "2026-04-10", count: 2 },
          ]
        }),
      trendBySignals: ({ signalIds, timeRange }) =>
        Effect.sync(() => {
          trendInputs.push({
            signalIds,
            from: timeRange.from ?? new Date(0),
            to: timeRange.to ?? new Date(0),
          })
          return [
            { signalId: activeSignal.id, buckets: [{ bucket: "2026-04-09", count: 5 }] },
            { signalId: regressedSignal.id, buckets: [{ bucket: "2026-04-08", count: 4 }] },
          ]
        }),
    })
    const { calls } = createSignalSearch([])
    traceCount = 10

    const result = await Effect.runPromise(
      listSignalsUseCase({
        organizationId,
        projectId,
        lifecycleGroup: "active",
        now,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(SignalRepository, signalRepository),
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
    expect(result.analytics.counts.resolvedSignals).toBe(2)
    expect(result.analytics.counts.regressedSignals).toBe(0)
    expect(result.analytics.counts.ongoingSignals).toBe(1)
    expect(result.analytics.counts.seenOccurrences).toBe(16)
    expect(result.items.map((item) => item.states)).toEqual([[SignalState.Ongoing]])
    expect(result.items.map((item) => item.id)).toEqual([activeSignal.id])
    expect(result.occurrencesSum).toBe(5)
    expect(result.items[0]?.affectedTracesPercent).toBe(0.5)
    expect(result.items[0]?.evaluations.map((evaluation) => evaluation.id)).toEqual([EvaluationId("1".repeat(24))])
    // Adaptive bucketing over 7 days picks 4h buckets → 6 bars/day × 7 days = 42.
    expect(result.analytics.histogram).toHaveLength(42)
    expect(result.analytics.histogramBucketSeconds).toBe(4 * 60 * 60)
    // Per-issue trend in the list keeps the daily 14-bar mini-bar.
    expect(result.items[0]?.trend).toHaveLength(14)
    expect(listBySignalIdsCalls).toEqual([[activeSignal.id]])
    expect(histogramInputs[0]?.signalIds).toEqual([activeSignal.id, regressedSignal.id, archivedSignal.id])
    expect(histogramInputs[0]?.from.toISOString()).toBe("2026-04-04T00:00:00.000Z")
    expect(histogramInputs[0]?.to.toISOString()).toBe("2026-04-10T23:59:59.999Z")
    expect(trendInputs[0]?.signalIds).toEqual([activeSignal.id])
    expect(trendInputs[0]?.from.toISOString()).toBe("2026-03-28T00:00:00.000Z")
    expect(trendInputs[0]?.to.toISOString()).toBe("2026-04-10T23:59:59.999Z")
  })

  it("attaches per-issue tag aggregates to the visible page", async () => {
    const now = new Date("2026-04-10T00:00:00.000Z")
    const taggedSignal = makeSignal({
      id: SignalId("a".repeat(24)),
    })
    const untaggedSignal = makeSignal({
      id: SignalId("b".repeat(24)),
    })

    const { repository: signalRepository } = createFakeSignalRepository([taggedSignal, untaggedSignal])
    const { repository: evaluationRepository } = createEvaluationRepository()
    const tagsInputs: Array<{
      signalIds: readonly string[]
      from: Date
      to: Date | undefined
    }> = []
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listSignalWindowMetrics: () =>
        Effect.succeed([
          makeWindowMetric({ signalId: taggedSignal.id, occurrences: 1 }),
          makeWindowMetric({ signalId: untaggedSignal.id, occurrences: 1 }),
        ]),
      aggregateBySignals: aggregateOccurrences([
        makeOccurrence({ signalId: taggedSignal.id }),
        makeOccurrence({ signalId: untaggedSignal.id }),
      ]),
      aggregateTagsBySignals: ({ signalIds, timeRange }) =>
        Effect.sync(() => {
          tagsInputs.push({ signalIds, from: timeRange.from, to: timeRange.to })
          return [{ signalId: taggedSignal.id, tags: ["checkout", "billing"] }].filter((entry) =>
            signalIds.includes(entry.signalId),
          )
        }),
    })
    createSignalSearch([])

    const result = await Effect.runPromise(
      listSignalsUseCase({ organizationId, projectId, now }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(SignalRepository, signalRepository),
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
    expect(tagsInputs[0]?.signalIds).toEqual([taggedSignal.id, untaggedSignal.id])
    expect(tagsInputs[0]?.to?.toISOString()).toBe(now.toISOString())
    const expectedFrom = new Date(now)
    expectedFrom.setUTCDate(expectedFrom.getUTCDate() - 30)
    expect(tagsInputs[0]?.from?.toISOString()).toBe(expectedFrom.toISOString())

    const tagsBySignalId = new Map(result.items.map((item) => [item.id, item.tags] as const))
    expect(tagsBySignalId.get(taggedSignal.id)).toEqual(["checkout", "billing"])
    expect(tagsBySignalId.get(untaggedSignal.id)).toEqual([])
  })

  it("honors the operator-selected time range when aggregating tags", async () => {
    const now = new Date("2026-04-10T00:00:00.000Z")
    const issue = makeSignal({ id: SignalId("a".repeat(24)) })
    const { repository: signalRepository } = createFakeSignalRepository([issue])
    const { repository: evaluationRepository } = createEvaluationRepository()
    const tagsInputs: Array<{
      signalIds: readonly string[]
      from: Date
      to: Date | undefined
    }> = []
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listSignalWindowMetrics: () => Effect.succeed([makeWindowMetric({ signalId: issue.id })]),
      aggregateBySignals: aggregateOccurrences([makeOccurrence({ signalId: issue.id })]),
      aggregateTagsBySignals: ({ signalIds, timeRange }) =>
        Effect.sync(() => {
          tagsInputs.push({ signalIds, from: timeRange.from, to: timeRange.to })
          return []
        }),
    })
    createSignalSearch([])

    const selectedFrom = new Date("2026-04-01T00:00:00.000Z")
    const selectedTo = new Date("2026-04-08T23:59:59.999Z")

    await Effect.runPromise(
      listSignalsUseCase({
        organizationId,
        projectId,
        now,
        timeRange: { from: selectedFrom, to: selectedTo },
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(SignalRepository, signalRepository),
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
      const issue = makeSignal({
        id: SignalId("m".repeat(24)),
        name: "Histogram issue",
      })

      const { repository: signalRepository } = createFakeSignalRepository([issue])
      const { repository: evaluationRepository } = createEvaluationRepository()
      const histogramInputs: Array<{
        signalIds: readonly string[]
        from: Date
        to: Date
        bucketSeconds: number
      }> = []
      const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
        listSignalWindowMetrics: () =>
          Effect.succeed([
            makeWindowMetric({
              signalId: issue.id,
              occurrences: 3,
              firstSeenAt: new Date("2026-03-01T00:00:00.000Z"),
              lastSeenAt: new Date("2026-04-10T00:00:00.000Z"),
            }),
          ]),
        aggregateBySignals: aggregateOccurrences([
          makeOccurrence({
            signalId: issue.id,
            totalOccurrences: 3,
            recentOccurrences: 3,
            baselineAvgOccurrences: 1,
            firstSeenAt: new Date("2026-03-01T00:00:00.000Z"),
            lastSeenAt: new Date("2026-04-10T00:00:00.000Z"),
          }),
        ]),
        histogramBySignals: ({ signalIds, timeRange, bucketSeconds }) =>
          Effect.sync(() => {
            histogramInputs.push({
              signalIds,
              from: timeRange.from ?? new Date(0),
              to: timeRange.to ?? new Date(0),
              bucketSeconds,
            })
            return []
          }),
      })
      createSignalSearch([])
      traceCount = 3

      const result = await Effect.runPromise(
        listSignalsUseCase({
          organizationId,
          projectId,
          ...(timeRange ? { timeRange } : {}),
          now,
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(SignalRepository, signalRepository),
              Layer.succeed(EvaluationRepository, evaluationRepository),
              Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
              Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
              Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
              provideTraceRepository,
            ),
          ),
        ),
      )

      expect(histogramInputs[0]?.signalIds).toEqual([issue.id])
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
    const firstSignal = makeSignal({
      id: SignalId("d".repeat(24)),
      name: "First search match",
    })
    const secondSignal = makeSignal({
      id: SignalId("e".repeat(24)),
      name: "Second search match",
    })
    const thirdSignal = makeSignal({
      id: SignalId("f".repeat(24)),
      name: "Filtered by search",
    })

    const signalSearch = createSignalSearch([
      {
        signalId: secondSignal.id,
        name: secondSignal.name,
        description: secondSignal.description,
        score: 0.9,
      },
      {
        signalId: firstSignal.id,
        name: firstSignal.name,
        description: firstSignal.description,
        score: 0.6,
      },
    ])
    const { repository: signalRepository } = createFakeSignalRepository([firstSignal, secondSignal, thirdSignal], {
      hybridSearch: signalSearch.hybridSearch,
    })
    const { repository: evaluationRepository } = createEvaluationRepository()
    const histogramInputs: Array<{ signalIds: readonly string[] }> = []
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listSignalWindowMetrics: () =>
        Effect.succeed([
          makeWindowMetric({
            signalId: firstSignal.id,
            occurrences: 4,
            lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
          }),
          makeWindowMetric({
            signalId: secondSignal.id,
            occurrences: 4,
            lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
          }),
          makeWindowMetric({
            signalId: thirdSignal.id,
            occurrences: 9,
            lastSeenAt: new Date("2026-04-10T00:00:00.000Z"),
          }),
        ]),
      aggregateBySignals: aggregateOccurrences([
        makeOccurrence({
          signalId: firstSignal.id,
          lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
        }),
        makeOccurrence({
          signalId: secondSignal.id,
          lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
        }),
      ]),
      histogramBySignals: ({ signalIds }) =>
        Effect.sync(() => {
          histogramInputs.push({ signalIds })
          return [{ bucket: "2026-04-09", count: 8 }]
        }),
    })
    const { calls } = signalSearch
    traceCount = 20

    const result = await Effect.runPromise(
      listSignalsUseCase({
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
            Layer.succeed(SignalRepository, signalRepository),
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
    expect(result.items.map((item) => item.id)).toEqual([secondSignal.id, firstSignal.id])
    expect(result.items.map((item) => item.similarityScore)).toEqual([0.9, 0.6])
    expect(histogramInputs[0]?.signalIds).toEqual([secondSignal.id, firstSignal.id])
  })

  it("sorts by occurrences and paginates visible rows", async () => {
    const now = new Date("2026-04-10T12:00:00.000Z")
    const firstSignal = makeSignal({
      id: SignalId("g".repeat(24)),
      name: "First issue",
    })
    const secondSignal = makeSignal({
      id: SignalId("h".repeat(24)),
      name: "Second issue",
    })
    const thirdSignal = makeSignal({
      id: SignalId("j".repeat(24)),
      name: "Third issue",
    })

    const { repository: signalRepository } = createFakeSignalRepository([firstSignal, secondSignal, thirdSignal])
    const { repository: evaluationRepository, listBySignalIdsCalls } = createEvaluationRepository([
      makeEvaluation({
        id: EvaluationId("3".repeat(24)),
        signalId: secondSignal.id,
        name: "Second issue evaluation",
      }),
    ])
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listSignalWindowMetrics: () =>
        Effect.succeed([
          makeWindowMetric({
            signalId: firstSignal.id,
            occurrences: 3,
            lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
          }),
          makeWindowMetric({
            signalId: secondSignal.id,
            occurrences: 1,
            lastSeenAt: new Date("2026-04-08T00:00:00.000Z"),
          }),
          makeWindowMetric({
            signalId: thirdSignal.id,
            occurrences: 2,
            lastSeenAt: new Date("2026-04-07T00:00:00.000Z"),
          }),
        ]),
      aggregateBySignals: aggregateOccurrences([
        makeOccurrence({ signalId: firstSignal.id }),
        makeOccurrence({ signalId: secondSignal.id }),
        makeOccurrence({ signalId: thirdSignal.id }),
      ]),
      trendBySignals: () =>
        Effect.succeed([
          {
            signalId: secondSignal.id,
            buckets: [{ bucket: "2026-04-08", count: 1 }],
          },
        ]),
    })
    createSignalSearch([])
    traceCount = 5

    const result = await Effect.runPromise(
      listSignalsUseCase({
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
            Layer.succeed(SignalRepository, signalRepository),
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
    expect(result.items.map((item) => item.id)).toEqual([secondSignal.id])
    expect(result.items[0]?.evaluations.map((evaluation) => evaluation.id)).toEqual([EvaluationId("3".repeat(24))])
    expect(listBySignalIdsCalls).toEqual([[secondSignal.id]])
  })

  it("honors ascending last-seen sorting", async () => {
    const now = new Date("2026-04-10T12:00:00.000Z")
    const oldestSignal = makeSignal({
      id: SignalId("k".repeat(24)),
      name: "Oldest issue",
    })
    const newestSignal = makeSignal({
      id: SignalId("l".repeat(24)),
      name: "Newest issue",
    })

    const { repository: signalRepository } = createFakeSignalRepository([oldestSignal, newestSignal])
    const { repository: evaluationRepository } = createEvaluationRepository()
    const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
      listSignalWindowMetrics: () =>
        Effect.succeed([
          makeWindowMetric({
            signalId: oldestSignal.id,
            occurrences: 2,
            lastSeenAt: new Date("2026-04-02T00:00:00.000Z"),
          }),
          makeWindowMetric({
            signalId: newestSignal.id,
            occurrences: 1,
            lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
          }),
        ]),
      aggregateBySignals: aggregateOccurrences([
        makeOccurrence({
          signalId: oldestSignal.id,
          lastSeenAt: new Date("2026-04-02T00:00:00.000Z"),
        }),
        makeOccurrence({
          signalId: newestSignal.id,
          lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
        }),
      ]),
    })
    createSignalSearch([])
    traceCount = 4

    const result = await Effect.runPromise(
      listSignalsUseCase({
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
            Layer.succeed(SignalRepository, signalRepository),
            Layer.succeed(EvaluationRepository, evaluationRepository),
            Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
            Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
            provideTraceRepository,
          ),
        ),
      ),
    )

    expect(result.items.map((item) => item.id)).toEqual([oldestSignal.id, newestSignal.id])
  })

  describe("priority grouping and assignee filtering", () => {
    const now = new Date("2026-04-10T12:00:00.000Z")

    /**
     * Runs the use case over seeded issues that all have window activity, so
     * tests only describe the triage shape (priority/assignee) plus optional
     * per-issue metrics and the use-case input under test.
     */
    const runTriageList = async (input: {
      readonly seeded: readonly {
        readonly issue: Signal
        readonly occurrences?: number
        readonly lastSeenAt?: Date
      }[]
      readonly options?: Partial<ListSignalsInput>
    }) => {
      const { repository: signalRepository } = createFakeSignalRepository(input.seeded.map((entry) => entry.issue))
      const { repository: evaluationRepository } = createEvaluationRepository()
      const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
        listSignalWindowMetrics: () =>
          Effect.succeed(
            input.seeded.map((entry) =>
              makeWindowMetric({
                signalId: SignalId(entry.issue.id),
                occurrences: entry.occurrences ?? 1,
                lastSeenAt: entry.lastSeenAt ?? new Date("2026-04-09T00:00:00.000Z"),
              }),
            ),
          ),
        aggregateBySignals: aggregateOccurrences(
          input.seeded.map((entry) => makeOccurrence({ signalId: SignalId(entry.issue.id) })),
        ),
      })
      traceCount = 10

      return Effect.runPromise(
        listSignalsUseCase({ organizationId, projectId, now, ...input.options }).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(SignalRepository, signalRepository),
              Layer.succeed(EvaluationRepository, evaluationRepository),
              Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
              Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
              Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
              provideTraceRepository,
            ),
          ),
        ),
      )
    }

    const lowSignal = makeSignal({ id: SignalId("a".repeat(24)), priority: "low" })
    const urgentSignal = makeSignal({ id: SignalId("b".repeat(24)), priority: "urgent" })
    const unsetSignal = makeSignal({ id: SignalId("c".repeat(24)), priority: null })
    const mediumSignal = makeSignal({ id: SignalId("d".repeat(24)), priority: "medium" })
    const highSignal = makeSignal({ id: SignalId("e".repeat(24)), priority: "high" })
    const mixedPrioritySeed = [lowSignal, urgentSignal, unsetSignal, mediumSignal, highSignal].map((issue) => ({
      issue,
    }))

    it("groups by priority urgent → high → medium → low → none regardless of the selected sort", async () => {
      const result = await runTriageList({ seeded: mixedPrioritySeed })

      expect(result.items.map((item) => item.id)).toEqual([
        urgentSignal.id,
        highSignal.id,
        mediumSignal.id,
        lowSignal.id,
        unsetSignal.id,
      ])
      expect(result.priorityCounts).toEqual({ urgent: 1, high: 1, medium: 1, low: 1, none: 1 })
      expect(result.items[0]?.priority).toBe("urgent")
      expect(result.items[0]?.assigneeId).toBeNull()
    })

    it("applies the user-selected sort within each priority group", async () => {
      const highQuiet = makeSignal({ id: SignalId("a".repeat(24)), priority: "high" })
      const highBusy = makeSignal({ id: SignalId("b".repeat(24)), priority: "high" })
      const lowBusy = makeSignal({ id: SignalId("c".repeat(24)), priority: "low" })
      const lowQuiet = makeSignal({ id: SignalId("d".repeat(24)), priority: "low" })

      const result = await runTriageList({
        seeded: [
          { issue: highQuiet, occurrences: 5 },
          { issue: highBusy, occurrences: 9 },
          { issue: lowBusy, occurrences: 7 },
          { issue: lowQuiet, occurrences: 3 },
        ],
        options: { sort: { field: "occurrences", direction: "desc" } },
      })

      expect(result.items.map((item) => item.id)).toEqual([highBusy.id, highQuiet.id, lowBusy.id, lowQuiet.id])
    })

    it("keeps priority grouping stable across pagination slices", async () => {
      const result = await runTriageList({
        seeded: mixedPrioritySeed,
        options: { limit: 2, offset: 2 },
      })

      expect(result.items.map((item) => item.id)).toEqual([mediumSignal.id, lowSignal.id])
      expect(result.totalCount).toBe(5)
      expect(result.hasMore).toBe(true)
      // Header counts cover the whole filtered set, not just the loaded page.
      expect(result.priorityCounts).toEqual({ urgent: 1, high: 1, medium: 1, low: 1, none: 1 })
    })

    const userA = "1".repeat(24)
    const userB = "2".repeat(24)
    const assignedToA = makeSignal({ id: SignalId("a".repeat(24)), assigneeId: userA, priority: "high" })
    const assignedToB = makeSignal({ id: SignalId("b".repeat(24)), assigneeId: userB })
    const unassigned = makeSignal({ id: SignalId("c".repeat(24)), assigneeId: null })
    const assigneeSeed = [
      { issue: assignedToA, occurrences: 2 },
      { issue: assignedToB, occurrences: 3 },
      { issue: unassigned, occurrences: 4 },
    ]

    it("filters by assignee and scopes totals and priority counts to the filtered set", async () => {
      const result = await runTriageList({
        seeded: assigneeSeed,
        options: { assigneeIds: [userA] },
      })

      expect(result.items.map((item) => item.id)).toEqual([assignedToA.id])
      expect(result.items[0]?.assigneeId).toBe(userA)
      expect(result.totalCount).toBe(1)
      expect(result.occurrencesSum).toBe(2)
      expect(result.priorityCounts).toEqual({ urgent: 0, high: 1, medium: 0, low: 0, none: 0 })
    })

    it("supports the unassigned sentinel alone and in union with user ids", async () => {
      const unassignedOnly = await runTriageList({
        seeded: assigneeSeed,
        options: { assigneeIds: ["unassigned"] },
      })
      expect(unassignedOnly.items.map((item) => item.id)).toEqual([unassigned.id])

      const union = await runTriageList({
        seeded: assigneeSeed,
        options: { assigneeIds: [userA, "unassigned"] },
      })
      expect(union.items.map((item) => item.id)).toEqual([assignedToA.id, unassigned.id])
    })

    it("computes assignee counts before the assignee filter so the badge never zeroes itself", async () => {
      const result = await runTriageList({
        seeded: assigneeSeed,
        options: { assigneeIds: [userA] },
      })

      expect(result.assigneeCounts).toEqual({ [userA]: 1, [userB]: 1, unassigned: 1 })
    })

    it("scopes assignee counts to the selected lifecycle group", async () => {
      const activeAssigned = makeSignal({ id: SignalId("a".repeat(24)), assigneeId: userA })
      const resolvedAssigned = makeSignal({
        id: SignalId("b".repeat(24)),
        assigneeId: userA,
        resolvedAt: new Date("2026-04-08T00:00:00.000Z"),
      })

      const result = await runTriageList({
        seeded: [
          { issue: activeAssigned },
          { issue: resolvedAssigned, lastSeenAt: new Date("2026-04-07T00:00:00.000Z") },
        ],
        options: { lifecycleGroup: "active" },
      })

      expect(result.items.map((item) => item.id)).toEqual([activeAssigned.id])
      expect(result.assigneeCounts).toEqual({ [userA]: 1 })
    })
  })
})
