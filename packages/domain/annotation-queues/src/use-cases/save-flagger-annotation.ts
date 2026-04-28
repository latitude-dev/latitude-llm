import { type ScoreDraftClosedError, type ScoreDraftUpdateConflictError, writeScoreUseCase } from "@domain/scores"
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

/**
 * Saves a flagger draft annotation. Transactional counterpart to
 * `draftFlaggerAnnotationUseCase`.
 *
 * Multiple drafts per `(trace, flagger)` are allowed by design — issue
 * discovery clusters them downstream — so this use case does not de-duplicate
 * against existing drafts. Each call writes a new row with the upstream-
 * generated `scoreId`.
 *
 * Flagger-authored drafts:
 * - `source = "flagger"` with `sourceId = flaggerId`
 * - `draftedAt != null` (draft status)
 * - `passed = false`, `value = 0`, no anchor (conversation-level)
 * - Do NOT auto-publish (no `annotation-scores:publish` event)
 */
export const saveFlaggerAnnotationUseCase = Effect.fn("annotationQueues.saveFlaggerAnnotation")(function* (
  input: SaveFlaggerAnnotationInput,
) {
  yield* Effect.annotateCurrentSpan("flagger.id", input.flaggerId)
  yield* Effect.annotateCurrentSpan("flagger.traceId", input.traceId)

  const parsedInput = yield* parseOrBadRequest(flaggerAnnotateInputSchema, input, "Invalid flagger annotate input")

  const projectId = ProjectId(parsedInput.projectId)
  const traceId = TraceId(parsedInput.traceId)
  const flaggerId = parsedInput.flaggerId

  const draft = yield* writeScoreUseCase({
    id: ScoreId(parsedInput.scoreId),
    projectId,
    source: "flagger",
    sourceId: flaggerId,
    traceId,
    sessionId: null,
    spanId: null,
    simulationId: null,
    issueId: null,
    annotatorId: null,
    value: FLAGGER_DRAFT_DEFAULTS.value,
    passed: FLAGGER_DRAFT_DEFAULTS.passed,
    feedback: input.feedback,
    metadata: { rawFeedback: input.feedback },
    error: null,
    draftedAt: new Date(),
  })

  return flaggerAnnotateOutputSchema.parse({
    flaggerId,
    traceId: parsedInput.traceId,
    draftAnnotationId: draft.id,
  }) as FlaggerAnnotateOutput
})
