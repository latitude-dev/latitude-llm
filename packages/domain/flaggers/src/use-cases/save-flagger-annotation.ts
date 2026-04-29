import {
  type ScoreDraftClosedError,
  type ScoreDraftUpdateConflictError,
  ScoreRepository,
  writeScoreUseCase,
} from "@domain/scores"
import { BadRequestError, ProjectId, type RepositoryError, ScoreId, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { FLAGGER_DRAFT_DEFAULTS } from "../constants.ts"
import {
  type FlaggerAnnotateInput,
  type FlaggerAnnotateOutput,
  flaggerAnnotateInputSchema,
  flaggerAnnotateOutputSchema,
} from "./flagger-annotator-contracts.ts"

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
  const scoreRepository = yield* ScoreRepository

  const existing = yield* scoreRepository.findPublishedSystemAnnotationByTraceAndFeedback({
    projectId,
    traceId,
    feedback: input.feedback,
  })
  if (existing !== null) {
    return flaggerAnnotateOutputSchema.parse({
      flaggerId,
      traceId: parsedInput.traceId,
      draftAnnotationId: existing.id,
    }) as FlaggerAnnotateOutput
  }

  const annotation = yield* writeScoreUseCase({
    id: ScoreId(parsedInput.scoreId),
    projectId,
    source: "annotation",
    sourceId: "SYSTEM",
    traceId,
    sessionId: parsedInput.sessionId ?? null,
    spanId: null,
    simulationId: parsedInput.simulationId ?? null,
    issueId: null,
    annotatorId: null,
    value: FLAGGER_DRAFT_DEFAULTS.value,
    passed: FLAGGER_DRAFT_DEFAULTS.passed,
    feedback: input.feedback,
    metadata: { rawFeedback: input.feedback },
    error: null,
    draftedAt: null,
  })

  return flaggerAnnotateOutputSchema.parse({
    flaggerId,
    traceId: parsedInput.traceId,
    draftAnnotationId: annotation.id,
  }) as FlaggerAnnotateOutput
})
