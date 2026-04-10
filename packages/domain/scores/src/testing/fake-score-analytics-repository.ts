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
    insert: (score) => {
      inserted.push(score.id)
      return Effect.void
    },
    aggregateByProject: () => Effect.succeed(EMPTY_AGGREGATE),
    aggregateBySource: () => Effect.succeed(EMPTY_AGGREGATE),
    trendBySource: () => Effect.succeed([]),
    trendByProject: () => Effect.succeed([]),
    rollupByTraceIds: () => Effect.succeed([]),
    rollupBySessionIds: () => Effect.succeed([]),
    aggregateByIssues: () => Effect.succeed([]),
    trendByIssue: () => Effect.succeed([]),
    listIssueWindowMetrics: () => Effect.succeed([]),
    histogramByIssues: () => Effect.succeed([]),
    trendByIssues: () => Effect.succeed([]),
    countDistinctTracesByTimeRange: () => Effect.succeed(0),
    listTracesByIssue: () =>
      Effect.succeed({
        items: [],
        hasMore: false,
        limit: 25,
        offset: 0,
      }),
    delete: (id) =>
      Effect.sync(() => {
        const index = inserted.indexOf(id)
        if (index !== -1) inserted.splice(index, 1)
      }),
    ...overrides,
  }

  return { repository, inserted }
}
