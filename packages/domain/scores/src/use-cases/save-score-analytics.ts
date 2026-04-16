import { ScoreId } from "@domain/shared"
import { Effect } from "effect"
import { isImmutableScore } from "../helpers.ts"
import { ScoreAnalyticsRepository } from "../ports/score-analytics-repository.ts"
import { ScoreRepository } from "../ports/score-repository.ts"

export interface SyncScoreAnalyticsInput {
  readonly organizationId: string
  readonly scoreId: string
}

export const syncScoreAnalyticsUseCase = (input: SyncScoreAnalyticsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("score.scoreId", input.scoreId)
    const scoreRepository = yield* ScoreRepository
    const analyticsRepository = yield* ScoreAnalyticsRepository

    const score = yield* scoreRepository
      .findById(ScoreId(input.scoreId))
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    if (!score || !isImmutableScore(score)) {
      return
    }

    const alreadyStoredInAnalytics = yield* analyticsRepository.existsById(score.id)
    if (alreadyStoredInAnalytics) {
      return
    }

    yield* analyticsRepository.insert(score)
  }).pipe(Effect.withSpan("scores.syncScoreAnalytics"))
