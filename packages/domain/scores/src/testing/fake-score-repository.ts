import { NotFoundError, type ScoreId } from "@domain/shared"
import { Effect } from "effect"
import { SIGNAL_FLAGGER_SLUG_SAMPLE_LIMIT } from "../constants.ts"
import type { Score } from "../entities/score.ts"
import type { ScoreRepositoryShape } from "../ports/score-repository.ts"

const EMPTY_PAGE = { items: [], hasMore: false, limit: 50, offset: 0 } as const

export const createFakeScoreRepository = (overrides?: Partial<ScoreRepositoryShape>) => {
  const scores = new Map<string, Score>()
  const isCanonicalEvaluationScore = (score: Score, evaluationId: string) =>
    score.sourceType === "evaluation" && score.sourceId === evaluationId && score.draftedAt === null

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
    assignSignalIfUnowned: ({ scoreId, signalId, updatedAt }) => {
      const score = scores.get(scoreId)
      if (!score || score.signalId !== null) {
        return Effect.succeed(false)
      }

      scores.set(scoreId, {
        ...score,
        signalId,
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
    listByTraceIds: () => Effect.succeed(EMPTY_PAGE),
    countAnnotationsByTraceIds: () => Effect.succeed([]),
    listBySessionId: () => Effect.succeed(EMPTY_PAGE),
    listBySpanId: () => Effect.succeed(EMPTY_PAGE),
    listBySignalId: () => Effect.succeed(EMPTY_PAGE),
    findPublishedSystemAnnotationByTraceAndFeedback: ({ projectId, traceId, feedback }) =>
      Effect.succeed(
        [...scores.values()].find(
          (score) =>
            score.projectId === projectId &&
            score.sourceType === "annotation" &&
            score.sourceId === "SYSTEM" &&
            score.traceId === traceId &&
            score.feedback === feedback &&
            score.draftedAt === null,
        ) ?? null,
      ),
    listFlaggerSlugsBySignalId: ({ projectId, signalId }) =>
      Effect.succeed(
        (() => {
          // Mirror the Postgres impl exactly: take the most-recent
          // `SIGNAL_FLAGGER_SLUG_SAMPLE_LIMIT` SYSTEM annotation occurrences for
          // the issue, *then* collapse to distinct slugs ordered by most-recent.
          // Applying the same sample cap means fake-backed tests can't observe
          // slugs that production would drop on noisy issues.
          const candidates = [...scores.values()]
            .filter(
              (score) =>
                score.projectId === projectId &&
                score.signalId === signalId &&
                score.sourceType === "annotation" &&
                score.sourceId === "SYSTEM" &&
                score.draftedAt === null,
            )
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, SIGNAL_FLAGGER_SLUG_SAMPLE_LIMIT)

          const lastSeenBySlug = new Map<string, Date>()
          for (const score of candidates) {
            const slug = (score.metadata as { flaggerSlug?: unknown }).flaggerSlug
            if (typeof slug !== "string" || slug.length === 0) continue
            const previous = lastSeenBySlug.get(slug)
            if (previous === undefined || score.createdAt > previous) {
              lastSeenBySlug.set(slug, score.createdAt)
            }
          }
          return [...lastSeenBySlug.entries()].sort(([, a], [, b]) => b.getTime() - a.getTime()).map(([slug]) => slug)
        })(),
      ),
    ...overrides,
  }

  return { repository, scores }
}
