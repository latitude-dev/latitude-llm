import type { RepositoryError, ScoreId } from "@domain/shared"
import { Effect } from "effect"
import { ScoreAnalyticsRepository } from "../ports/score-analytics-repository.ts"

type DeleteScoreAnalyticsResult = { readonly action: "deleted" } | { readonly action: "not-found" }

export const deleteScoreAnalyticsUseCase = (input: { scoreId: ScoreId }) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("score.scoreId", input.scoreId)
    const analyticsRepository = yield* ScoreAnalyticsRepository

    const exists = yield* analyticsRepository.existsById(input.scoreId)
    if (!exists) {
      return { action: "not-found" } satisfies DeleteScoreAnalyticsResult
    }

    yield* analyticsRepository.delete(input.scoreId)
    return { action: "deleted" } satisfies DeleteScoreAnalyticsResult
  }).pipe(Effect.withSpan("scores.deleteScoreAnalytics")) as Effect.Effect<DeleteScoreAnalyticsResult, RepositoryError>
