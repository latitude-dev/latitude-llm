import { ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { BadRequestError, type RepositoryError, type ScoreId, SqlClient } from "@domain/shared"
import { Effect } from "effect"

export interface DeleteAnnotationInput {
  readonly scoreId: ScoreId
}

export type DeleteAnnotationError = RepositoryError | BadRequestError

export const deleteAnnotationUseCase = (input: DeleteAnnotationInput) =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const scoreRepository = yield* ScoreRepository
        const analyticsRepository = yield* ScoreAnalyticsRepository

        const score = yield* scoreRepository.findById(input.scoreId)

        if (!score) {
          return yield* new BadRequestError({ message: `Score ${input.scoreId} not found` })
        }

        if (score.source !== "annotation") {
          return yield* new BadRequestError({
            message: `Score ${input.scoreId} is not an annotation (source: ${score.source})`,
          })
        }

        yield* scoreRepository.delete(input.scoreId)

        // If already in ClickHouse analytics, issue rare delete mutation
        const existsInAnalytics = yield* analyticsRepository.existsById(input.scoreId)
        if (existsInAnalytics) {
          yield* analyticsRepository.deleteById(input.scoreId)
        }
      }),
    )
  })
