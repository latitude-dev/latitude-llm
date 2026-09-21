import { ScoreId } from "@domain/shared"
import { Effect } from "effect"
import { isImmutableScore } from "../helpers.ts"
import { ScoreAnalyticsRepository } from "../ports/score-analytics-repository.ts"
import { ScoreRepository } from "../ports/score-repository.ts"

export interface ReplaceScoreAnalyticsInput {
  readonly scoreId: string
}

export const replaceScoreAnalyticsUseCase = Effect.fn("scores.replaceScoreAnalytics")(function* (
  input: ReplaceScoreAnalyticsInput,
) {
  const scoreRepository = yield* ScoreRepository
  const analyticsRepository = yield* ScoreAnalyticsRepository
  const score = yield* scoreRepository.findById(ScoreId(input.scoreId))

  if (!isImmutableScore(score)) return

  yield* analyticsRepository.delete(score.id)
  yield* analyticsRepository.insert(score)
})
