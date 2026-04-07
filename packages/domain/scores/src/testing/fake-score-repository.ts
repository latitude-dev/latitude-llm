import { NotFoundError, type ScoreId } from "@domain/shared"
import { Effect } from "effect"
import type { Score } from "../entities/score.ts"
import type { ScoreRepositoryShape } from "../ports/score-repository.ts"

const EMPTY_PAGE = { items: [], hasMore: false, limit: 50, offset: 0 } as const

export const createFakeScoreRepository = (overrides?: Partial<ScoreRepositoryShape>) => {
  const scores = new Map<string, Score>()

  const repository: ScoreRepositoryShape = {
    findById: (id) => {
      const score = scores.get(id)
      if (!score) return Effect.fail(new NotFoundError({ entity: "Score", id }))
      return Effect.succeed(score)
    },
    save: (score) => {
      scores.set(score.id, score)
      return Effect.void
    },
    assignIssueIfUnowned: ({ scoreId, issueId, updatedAt }) => {
      const score = scores.get(scoreId)
      if (!score || score.issueId !== null) {
        return Effect.succeed(false)
      }

      scores.set(scoreId, {
        ...score,
        issueId,
        updatedAt,
      })
      return Effect.succeed(true)
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
