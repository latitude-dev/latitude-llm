import type { ScoreId } from "@domain/shared"
import { Effect } from "effect"
import type { Score } from "../entities/score.ts"
import type { ScoreRepositoryShape } from "../ports/score-repository.ts"

const EMPTY_PAGE = { items: [], hasMore: false, limit: 50, offset: 0 } as const

export const createFakeScoreRepository = (overrides?: Partial<ScoreRepositoryShape>) => {
  const scores = new Map<string, Score>()

  const repository: ScoreRepositoryShape = {
    findById: (id) => Effect.succeed(scores.get(id) ?? null),
    save: (score) => {
      scores.set(score.id, score)
      return Effect.void
    },
    delete: (id: ScoreId) => {
      scores.delete(id)
      return Effect.void
    },
    listByProjectId: () => Effect.succeed(EMPTY_PAGE),
    listBySourceId: () => Effect.succeed(EMPTY_PAGE),
    listByTraceId: () => Effect.succeed(EMPTY_PAGE),
    listBySessionId: () => Effect.succeed(EMPTY_PAGE),
    listBySpanId: () => Effect.succeed(EMPTY_PAGE),
    listByIssueId: () => Effect.succeed(EMPTY_PAGE),
    ...overrides,
  }

  return { repository, scores }
}
