import type { ScoreDraftClosedError, ScoreDraftUpdateConflictError } from "@domain/scores"
import { BadRequestError, ProjectId, type RepositoryError, ScoreId, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import {
  type FlaggerAnnotateInput,
  type FlaggerAnnotateOutput,
  flaggerAnnotateInputSchema,
  flaggerAnnotateOutputSchema,
} from "./flagger-annotator-contracts.ts"
import { upsertFlaggerAnnotationScore } from "./upsert-flagger-annotation-score.ts"

const formatValidationError = (error: z.ZodError): string => error.issues.map((issue) => issue.message).join(", ")

const parseOrBadRequest = <T>(schema: z.ZodType<T>, input: unknown, message: string) =>
  Effect.try({
    try: () => schema.parse(input),
    catch: (error: unknown) =>
      new BadRequestError({
        message: error instanceof z.ZodError ? formatValidationError(error) : message,
      }),
  })

export interface SaveFlaggerAnnotationInput extends FlaggerAnnotateInput {
  readonly feedback: string
  readonly traceCreatedAt: string
  readonly messageIndex?: number | undefined
}

export type SaveFlaggerAnnotationError =
  | BadRequestError
  | RepositoryError
  | ScoreDraftClosedError
  | ScoreDraftUpdateConflictError

export const saveFlaggerAnnotationUseCase = Effect.fn("flaggers.saveFlaggerAnnotation")(function* (
  input: SaveFlaggerAnnotationInput,
) {
  yield* Effect.annotateCurrentSpan("flagger.id", input.flaggerId)
  yield* Effect.annotateCurrentSpan("flagger.traceId", input.traceId)

  const parsedInput = yield* parseOrBadRequest(flaggerAnnotateInputSchema, input, "Invalid flagger annotate input")

  const projectId = ProjectId(parsedInput.projectId)
  const traceId = TraceId(parsedInput.traceId)
  const flaggerId = parsedInput.flaggerId

  const result = yield* upsertFlaggerAnnotationScore({
    id: ScoreId(parsedInput.scoreId),
    projectId,
    traceId,
    sessionId: parsedInput.sessionId ?? null,
    simulationId: parsedInput.simulationId ?? null,
    feedback: input.feedback,
    messageIndex: input.messageIndex,
  })

  return flaggerAnnotateOutputSchema.parse({
    flaggerId,
    traceId: parsedInput.traceId,
    draftAnnotationId: result.scoreId,
  }) as FlaggerAnnotateOutput
})
