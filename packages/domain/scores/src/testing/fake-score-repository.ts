import { NotFoundError, type ScoreId } from "@domain/shared"
import { Effect } from "effect"
import type { Score } from "../entities/score.ts"
import type { ScoreRepositoryShape } from "../ports/score-repository.ts"

const EMPTY_PAGE = { items: [], hasMore: false, limit: 50, offset: 0 } as const

export const createFakeScoreRepository = (overrides?: Partial<ScoreRepositoryShape>) => {
  const scores = new Map<string, Score>()
  const isCanonicalEvaluationScore = (score: Score, evaluationId: string) =>
    score.source === "evaluation" && score.sourceId === evaluationId && score.draftedAt === null

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
    existsByEvaluationIdAndScope: ({ projectId, evaluationId, traceId, sessionId }) =>
      Effect.succeed(
        [...scores.values()].some((score) => {
          if (score.projectId !== projectId || !isCanonicalEvaluationScore(score, evaluationId)) {
            return false
          }

          if (sessionId) {
            return score.sessionId === sessionId
          }

          return score.traceId === traceId
        }),
      ),
    existsByEvaluationIdAndTraceId: ({ projectId, evaluationId, traceId }) =>
      Effect.succeed(
        [...scores.values()].some(
          (score) =>
            score.projectId === projectId &&
            isCanonicalEvaluationScore(score, evaluationId) &&
            score.traceId === traceId,
        ),
      ),
    listByProjectId: () => Effect.succeed(EMPTY_PAGE),
    listBySourceId: () => Effect.succeed(EMPTY_PAGE),
    listByTraceId: () => Effect.succeed(EMPTY_PAGE),
    listBySessionId: () => Effect.succeed(EMPTY_PAGE),
    listBySpanId: () => Effect.succeed(EMPTY_PAGE),
    listByIssueId: () => Effect.succeed(EMPTY_PAGE),
    findFlaggerDraftByTraceAndFlaggerId: ({ projectId, flaggerId, traceId }) =>
      Effect.succeed(
        [...scores.values()].find(
          (score) =>
            score.projectId === projectId &&
            score.source === "flagger" &&
            score.sourceId === flaggerId &&
            score.traceId === traceId &&
            score.draftedAt !== null,
        ) ?? null,
      ),
    findFlaggerPublishedByTraceAndFlaggerId: ({ projectId, flaggerId, traceId }) =>
      Effect.succeed(
        [...scores.values()].find(
          (score) =>
            score.projectId === projectId &&
            score.source === "flagger" &&
            score.sourceId === flaggerId &&
            score.traceId === traceId &&
            score.draftedAt === null,
        ) ?? null,
      ),
    ...overrides,
  }

  return { repository, scores }
}
