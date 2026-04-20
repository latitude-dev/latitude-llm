import { baseListScoresInputSchema, ScoreRepository, scoreDraftModeSchema } from "@domain/scores"
import { BadRequestError, cuidSchema, ProjectId, type RepositoryError, TraceId, traceIdSchema } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"

const formatValidationError = (error: z.ZodError): string => error.issues.map((issue) => issue.message).join(", ")

const parseOrBadRequest = <T>(schema: z.ZodType<T>, input: unknown, message: string) =>
  Effect.try({
    try: () => schema.parse(input),
    catch: (error: unknown) =>
      new BadRequestError({
        message: error instanceof z.ZodError ? formatValidationError(error) : message,
      }),
  })

/** List annotations for a trace (conversation in the trace drawer). Project-wide listing is intentionally omitted — UI is trace/session scoped. */
export const listTraceAnnotationsInputSchema = z.object({
  projectId: cuidSchema.transform(ProjectId),
  traceId: traceIdSchema.transform(TraceId),
  limit: baseListScoresInputSchema.shape.limit,
  offset: baseListScoresInputSchema.shape.offset,
  draftMode: scoreDraftModeSchema.default("include"), // draft-aware by default for trace-scoped reads
})
export type ListTraceAnnotationsInput = z.input<typeof listTraceAnnotationsInputSchema>

export type ListAnnotationsError = RepositoryError | BadRequestError

export const listTraceAnnotationsUseCase = Effect.fn("annotations.listTraceAnnotations")(function* (
  input: ListTraceAnnotationsInput,
) {
  const parsed = yield* parseOrBadRequest(
    listTraceAnnotationsInputSchema,
    input,
    "Invalid list trace annotations input",
  )
  yield* Effect.annotateCurrentSpan("annotation.projectId", parsed.projectId)
  yield* Effect.annotateCurrentSpan("annotation.traceId", parsed.traceId)

  const scoreRepository = yield* ScoreRepository

  return yield* scoreRepository.listByTraceId({
    projectId: parsed.projectId,
    traceId: parsed.traceId,
    source: "annotation",
    options: {
      limit: parsed.limit,
      offset: parsed.offset,
      draftMode: parsed.draftMode,
    },
  })
})
