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
  /**
   * Pre-generated id for the draft annotation score this use case will produce.
   *
   * Generated here (upstream of the LLM call) and passed through
   * `telemetry.metadata` on `ai.generate(...)`. Latitude's span processor
   * serializes it into the `latitude.metadata` JSON attribute on the exported
   * span, which the dogfood tenant sees as `metadata.scoreId`. The persist
   * step later writes the score row with this exact id. See PRD: "Identity
   * strategy".
   */
  readonly scoreId: ScoreId
}

interface DraftFlaggerAnnotationInput {
  readonly organizationId: string
  readonly projectId: string
  readonly flaggerSlug: string
  readonly traceId: string
}

export type DraftFlaggerAnnotationError = BadRequestError | RepositoryError | RunFlaggerAnnotatorError

/**
 * Drafts a flagger annotation by running the annotator to generate feedback.
 * This is a non-transactional operation that only generates the feedback text.
 * The actual persistence is handled separately by `persistFlaggerAnnotationUseCase`.
 *
 * This use case is idempotent — retrying with the same `(flaggerSlug, traceId)`
 * regenerates the same feedback (or similar, since LLM output may vary slightly).
 */
export const draftFlaggerAnnotationUseCase = Effect.fn("annotationQueues.draftFlaggerAnnotation")(function* (
  input: DraftFlaggerAnnotationInput,
) {
  yield* Effect.annotateCurrentSpan("flagger.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("flagger.projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("flagger.traceId", input.traceId)
  yield* Effect.annotateCurrentSpan("flagger.flaggerSlug", input.flaggerSlug)

  // Generate the score id up front so it can flow into the annotator's
  // `telemetry.metadata` and into the persist step's INSERT.
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
    scoreId,
  } as DraftFlaggerAnnotationOutput
})
