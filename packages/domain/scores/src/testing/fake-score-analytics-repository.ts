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
    rollupByTraceIds: () => Effect.succeed([]),
    rollupBySessionIds: () => Effect.succeed([]),
    aggregateByIssues: () => Effect.succeed([]),
    trendByIssue: () => Effect.succeed([]),
    delete: (id) =>
      Effect.sync(() => {
        const index = inserted.indexOf(id)
        if (index !== -1) inserted.splice(index, 1)
      }),
    ...overrides,
  }

  return { repository, inserted }
}
