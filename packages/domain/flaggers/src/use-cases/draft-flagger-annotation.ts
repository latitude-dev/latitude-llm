import { BadRequestError, generateId, type RepositoryError, type ScoreId } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { type RunFlaggerAnnotatorError, runFlaggerAnnotatorUseCase } from "./run-flagger-annotator.ts"

const formatValidationError = (error: z.ZodError): string => error.issues.map((issue) => issue.message).join(", ")

const draftFlaggerAnnotationInputSchema = z.object({
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
  flaggerSlug: z.string().min(1),
  traceId: z.string().min(1),
})

const parseOrBadRequest = <T>(schema: z.ZodType<T>, input: unknown, message: string) =>
  Effect.try({
    try: () => schema.parse(input),
    catch: (error: unknown) =>
      new BadRequestError({
        message: error instanceof z.ZodError ? formatValidationError(error) : message,
      }),
  })

export interface DraftFlaggerAnnotationOutput {
  readonly traceId: string
  readonly feedback: string
  readonly traceCreatedAt: string
  readonly sessionId: string | null
  readonly simulationId: string | null
  readonly scoreId: ScoreId
}

interface DraftFlaggerAnnotationInput {
  readonly organizationId: string
  readonly projectId: string
  readonly flaggerSlug: string
  readonly traceId: string
}

export type DraftFlaggerAnnotationError = BadRequestError | RepositoryError | RunFlaggerAnnotatorError

export const draftFlaggerAnnotationUseCase = Effect.fn("flaggers.draftFlaggerAnnotation")(function* (
  input: DraftFlaggerAnnotationInput,
) {
  yield* Effect.annotateCurrentSpan("flagger.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("flagger.projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("flagger.traceId", input.traceId)
  yield* Effect.annotateCurrentSpan("flagger.flaggerSlug", input.flaggerSlug)

  const scoreId = generateId<"ScoreId">()

  const parsedInput = yield* parseOrBadRequest(
    draftFlaggerAnnotationInputSchema,
    input,
    "Invalid flagger annotate input",
  )

  const annotatorResult = yield* runFlaggerAnnotatorUseCase({
    organizationId: parsedInput.organizationId,
    projectId: parsedInput.projectId,
    flaggerSlug: parsedInput.flaggerSlug,
    traceId: parsedInput.traceId,
    scoreId,
  })

  return {
    traceId: parsedInput.traceId,
    feedback: annotatorResult.feedback,
    traceCreatedAt: annotatorResult.traceCreatedAt,
    sessionId: annotatorResult.sessionId,
    simulationId: annotatorResult.simulationId,
    scoreId,
  } as DraftFlaggerAnnotationOutput
})
