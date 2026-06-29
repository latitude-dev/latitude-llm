import { BadRequestError, cuidSchema, ProjectId, type RepositoryError, TraceId, traceIdSchema } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { ScoreRepository, scoreDraftModeSchema } from "../ports/score-repository.ts"
import { baseListScoresInputSchema } from "./list-scores.ts"

const formatValidationError = (error: z.ZodError): string => error.issues.map((issue) => issue.message).join(", ")

const parseOrBadRequest = <T>(schema: z.ZodType<T>, input: unknown, message: string) =>
  Effect.try({
    try: () => schema.parse(input),
    catch: (error: unknown) =>
      new BadRequestError({
        message: error instanceof z.ZodError ? formatValidationError(error) : message,
      }),
  })

/** List every published score type for a trace (conversation in the trace drawer). */
export const listTraceScoresInputSchema = z.object({
  projectId: cuidSchema.transform(ProjectId),
  traceId: traceIdSchema.transform(TraceId),
  limit: baseListScoresInputSchema.shape.limit,
  offset: baseListScoresInputSchema.shape.offset,
  draftMode: scoreDraftModeSchema.default("include"),
})
export type ListTraceScoresInput = z.input<typeof listTraceScoresInputSchema>

export const listScoresByTraceIdsInputSchema = z.object({
  projectId: cuidSchema.transform(ProjectId),
  traceIds: z.array(traceIdSchema.transform(TraceId)).max(500),
  limit: baseListScoresInputSchema.shape.limit,
  offset: baseListScoresInputSchema.shape.offset,
  draftMode: scoreDraftModeSchema.default("include"),
})
export type ListScoresByTraceIdsInput = z.input<typeof listScoresByTraceIdsInputSchema>

export type ListTraceScoresError = RepositoryError | BadRequestError

export const listTraceScoresUseCase = Effect.fn("scores.listTraceScores")(function* (input: ListTraceScoresInput) {
  const parsed = yield* parseOrBadRequest(listTraceScoresInputSchema, input, "Invalid list trace scores input")
  yield* Effect.annotateCurrentSpan("score.projectId", parsed.projectId)
  yield* Effect.annotateCurrentSpan("score.traceId", parsed.traceId)

  const scoreRepository = yield* ScoreRepository

  return yield* scoreRepository.listByTraceId({
    projectId: parsed.projectId,
    traceId: parsed.traceId,
    options: {
      limit: parsed.limit,
      offset: parsed.offset,
      draftMode: parsed.draftMode,
    },
  })
})

/**
 * Every score across a set of traces (session panel Scores tab). Scopes by
 * `trace_id IN (...)` rather than `session_id` so orphan sessions still surface
 * their scores.
 */
export const listScoresByTraceIdsUseCase = Effect.fn("scores.listScoresByTraceIds")(function* (
  input: ListScoresByTraceIdsInput,
) {
  const parsed = yield* parseOrBadRequest(
    listScoresByTraceIdsInputSchema,
    input,
    "Invalid list scores by trace ids input",
  )
  yield* Effect.annotateCurrentSpan("score.projectId", parsed.projectId)
  yield* Effect.annotateCurrentSpan("score.traceCount", parsed.traceIds.length)

  if (parsed.traceIds.length === 0) {
    return {
      items: [],
      hasMore: false,
      limit: parsed.limit,
      offset: parsed.offset,
    }
  }

  const scoreRepository = yield* ScoreRepository

  return yield* scoreRepository.listByTraceIds({
    projectId: parsed.projectId,
    traceIds: parsed.traceIds,
    options: {
      limit: parsed.limit,
      offset: parsed.offset,
      draftMode: parsed.draftMode,
    },
  })
})
