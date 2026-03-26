import { BadRequestError, cuidSchema, ProjectId, type RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { SCORE_SOURCE_ID_MAX_LENGTH } from "../constants.ts"
import { scoreSourceSchema } from "../entities/score.ts"
import { ScoreRepository, scoreDraftModeSchema } from "../ports/score-repository.ts"

export const baseListScoresInputSchema = z.object({
  projectId: cuidSchema.transform(ProjectId),
  limit: z.number().int().positive().max(100).default(50),
  offset: z.number().int().nonnegative().default(0),
  draftMode: scoreDraftModeSchema.default("exclude"),
})

export const listProjectScoresInputSchema = baseListScoresInputSchema.extend({})
export type ListProjectScoresInput = z.input<typeof listProjectScoresInputSchema>

export const listSourceScoresInputSchema = baseListScoresInputSchema.extend({
  source: scoreSourceSchema,
  sourceId: z.string().min(1).max(SCORE_SOURCE_ID_MAX_LENGTH),
})
export type ListSourceScoresInput = z.input<typeof listSourceScoresInputSchema>

const formatValidationError = (error: z.ZodError): string => error.issues.map((issue) => issue.message).join(", ")

const parseOrBadRequest = <T>(schema: z.ZodType<T>, input: unknown, message: string) =>
  Effect.try({
    try: () => schema.parse(input),
    catch: (error: unknown) =>
      new BadRequestError({
        message: error instanceof z.ZodError ? formatValidationError(error) : message,
      }),
  })

export type ListScoresError = RepositoryError | BadRequestError

export const listProjectScoresUseCase = (input: ListProjectScoresInput) =>
  Effect.gen(function* () {
    const parsedInput = yield* parseOrBadRequest(listProjectScoresInputSchema, input, "Invalid project score query")
    const repository = yield* ScoreRepository

    return yield* repository.listByProjectId({
      projectId: parsedInput.projectId,
      options: {
        limit: parsedInput.limit,
        offset: parsedInput.offset,
        draftMode: parsedInput.draftMode,
      },
    })
  })

export const listSourceScoresUseCase = (input: ListSourceScoresInput) =>
  Effect.gen(function* () {
    const parsedInput = yield* parseOrBadRequest(listSourceScoresInputSchema, input, "Invalid source query")
    const repository = yield* ScoreRepository

    return yield* repository.listBySourceId({
      projectId: parsedInput.projectId,
      source: parsedInput.source,
      sourceId: parsedInput.sourceId,
      options: {
        limit: parsedInput.limit,
        offset: parsedInput.offset,
        draftMode: parsedInput.draftMode,
      },
    })
  })
