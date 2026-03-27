import { baseListScoresInputSchema, ScoreRepository, scoreDraftModeSchema } from "@domain/scores"
import { BadRequestError, cuidSchema, ProjectId, type RepositoryError, TraceId } from "@domain/shared"
import { traceIdSchema } from "@domain/spans"
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

// List annotations project-wide
export const listProjectAnnotationsInputSchema = z.object({
  projectId: cuidSchema.transform(ProjectId),
  sourceId: z.string().optional(), // optional filter by specific source_id (e.g., "UI", "API", or queue cuid)
  limit: baseListScoresInputSchema.shape.limit,
  offset: baseListScoresInputSchema.shape.offset,
  draftMode: scoreDraftModeSchema.default("exclude"),
})
export type ListProjectAnnotationsInput = z.input<typeof listProjectAnnotationsInputSchema>

export type ListAnnotationsError = RepositoryError | BadRequestError

export const listProjectAnnotationsUseCase = (input: ListProjectAnnotationsInput) =>
  Effect.gen(function* () {
    const parsed = yield* parseOrBadRequest(listProjectAnnotationsInputSchema, input, "Invalid list annotations input")

    const scoreRepository = yield* ScoreRepository

    return yield* scoreRepository.listBySourceId({
      projectId: parsed.projectId,
      source: "annotation",
      ...(parsed.sourceId !== undefined ? { sourceId: parsed.sourceId } : {}),
      options: {
        limit: parsed.limit,
        offset: parsed.offset,
        draftMode: parsed.draftMode,
      },
    })
  })

// List annotations scoped to a trace (draft-aware for review surfaces)
export const listTraceAnnotationsInputSchema = z.object({
  projectId: cuidSchema.transform(ProjectId),
  traceId: traceIdSchema.transform(TraceId),
  limit: baseListScoresInputSchema.shape.limit,
  offset: baseListScoresInputSchema.shape.offset,
  draftMode: scoreDraftModeSchema.default("include"), // draft-aware by default for trace-scoped reads
})
export type ListTraceAnnotationsInput = z.input<typeof listTraceAnnotationsInputSchema>

export const listTraceAnnotationsUseCase = (input: ListTraceAnnotationsInput) =>
  Effect.gen(function* () {
    const parsed = yield* parseOrBadRequest(
      listTraceAnnotationsInputSchema,
      input,
      "Invalid list trace annotations input",
    )

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
