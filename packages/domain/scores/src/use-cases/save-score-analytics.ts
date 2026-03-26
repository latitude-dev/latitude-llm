import { BadRequestError, type RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { scoreIdSchema } from "../entities/score.ts"
import { isImmutableScore } from "../helpers.ts"
import { ScoreAnalyticsRepository } from "../ports/score-analytics-repository.ts"
import { ScoreRepository } from "../ports/score-repository.ts"

const formatValidationError = (error: z.ZodError): string => error.issues.map((issue) => issue.message).join(", ")

const parseOrBadRequest = <T>(schema: z.ZodType<T>, input: unknown, message: string) =>
  Effect.try({
    try: () => schema.parse(input),
    catch: (error: unknown) =>
      new BadRequestError({
        message: error instanceof z.ZodError ? formatValidationError(error) : message,
      }),
  })

export type SaveScoreAnalyticsError = RepositoryError | BadRequestError

export const saveScoreAnalyticsInputSchema = z.object({
  scoreId: scoreIdSchema,
})
export type SaveScoreAnalyticsInput = z.input<typeof saveScoreAnalyticsInputSchema>

export const saveScoreAnalyticsUseCase = (input: SaveScoreAnalyticsInput) =>
  Effect.gen(function* () {
    const parsedInput = yield* parseOrBadRequest(
      saveScoreAnalyticsInputSchema,
      input,
      "Invalid score analytics save request",
    )
    const scoreRepository = yield* ScoreRepository
    const analyticsRepository = yield* ScoreAnalyticsRepository

    const score = yield* scoreRepository.findById(parsedInput.scoreId)
    if (!score || !isImmutableScore(score)) {
      return
    }

    const alreadyStoredInAnalytics = yield* analyticsRepository.existsById(score.id)
    if (alreadyStoredInAnalytics) {
      return
    }

    yield* analyticsRepository.insert(score)
  })
