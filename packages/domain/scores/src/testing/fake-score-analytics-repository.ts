import { Effect } from "effect"
import type { ScoreAnalyticsRepositoryShape } from "../ports/score-analytics-repository.ts"

const EMPTY_AGGREGATE = {
  totalScores: 0,
  avgValue: 0,
  avgDuration: 0,
  totalCost: 0,
  totalTokens: 0,
  passedCount: 0,
  failedCount: 0,
  erroredCount: 0,
} as const

export const createFakeScoreAnalyticsRepository = (overrides?: Partial<ScoreAnalyticsRepositoryShape>) => {
  const inserted: string[] = [] // score ids that were inserted

  const repository: ScoreAnalyticsRepositoryShape = {
    existsById: (id) => Effect.succeed(inserted.includes(id)),
    // TODO(repositories): rename insert -> save to match the repository port
    // once the public write verb cleanup lands.
    insert: (score) => {
      inserted.push(score.id)
      return Effect.void
    },
    aggregateByProject: () => Effect.succeed(EMPTY_AGGREGATE),
    aggregateBySource: () => Effect.succeed(EMPTY_AGGREGATE),
    trendBySource: () => Effect.succeed([]),
    trendByProject: () => Effect.succeed([]),
    escalationThresholdHistogramBySignals: () => Effect.succeed([]),
    rollupByTraceIds: () => Effect.succeed([]),
    rollupBySessionIds: () => Effect.succeed([]),
    aggregateBySignals: () => Effect.succeed([]),
    aggregateDimensionBySignal: ({ dimension }) =>
      Effect.succeed({ dimension, baseRate: 0, signalAffectedTraces: 0, values: [] }),
    aggregateImpactBySignal: ({ signalId }) =>
      Effect.succeed({
        signalId,
        occurrences: 0,
        affectedTraces: 0,
        affectedSessions: 0,
        affectedUsers: 0,
        costMicrocents: 0,
        tokens: 0,
      }),
    coOccurrenceBySignal: () => Effect.succeed({ mySessions: 0, totalSessions: 0, candidates: [] }),
    escalationSignalsBySignals: () => Effect.succeed([]),
    aggregateTagsBySignals: () => Effect.succeed([]),
    trendBySignal: () => Effect.succeed([]),
    listSignalWindowMetrics: () => Effect.succeed([]),
    histogramBySignals: () => Effect.succeed([]),
    trendBySignals: () => Effect.succeed([]),
    countDistinctTracesByTimeRange: () => Effect.succeed(0),
    listTracesBySignal: () =>
      Effect.succeed({
        items: [],
        hasMore: false,
        limit: 25,
        offset: 0,
      }),
    countTracesBySignal: () => Effect.succeed(0),
    listSignalsByTraceIds: () => Effect.succeed([]),
    listSignalsByUser: () => Effect.succeed([]),
    delete: (id) =>
      Effect.sync(() => {
        const index = inserted.indexOf(id)
        if (index !== -1) inserted.splice(index, 1)
      }),
    ...overrides,
  }

  return { repository, inserted }
}
