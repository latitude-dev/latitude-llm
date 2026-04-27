import {
  type ScoreDraftClosedError,
  type ScoreDraftUpdateConflictError,
  ScoreRepository,
  writeScoreUseCase,
} from "@domain/scores"
import { BadRequestError, ProjectId, type RepositoryError, ScoreId, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { SYSTEM_QUEUE_DRAFT_DEFAULTS } from "../constants.ts"
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

export interface PersistFlaggerAnnotationInput extends FlaggerAnnotateInput {
  readonly feedback: string
  readonly traceCreatedAt: string
}

export type PersistFlaggerAnnotationError =
  | BadRequestError
  | RepositoryError
  | ScoreDraftClosedError
  | ScoreDraftUpdateConflictError

/**
 * Persists a flagger draft annotation. This is the transactional counterpart to
 * `draftFlaggerAnnotationUseCase`.
 *
 * Idempotency: a previous run of the workflow may have already inserted the
 * draft. We look up by `(traceId, flaggerId)` and short-circuit when we find
 * one — the workflow's `workflowId` (`flagger:${traceId}:${flaggerSlug}`)
 * already prevents concurrent attempts; this guards against retries that
 * regenerated the upstream score id.
 *
 * Flagger-authored drafts:
 * - Use `source = "flagger"` with `sourceId = flaggerId`
 * - Have `draftedAt != null` (draft status)
 * - Default to `passed = false`, `value = 0`, no anchor (conversation-level)
 * - Do NOT auto-publish (no `annotation-scores:publish` event)
 */
export const persistFlaggerAnnotationUseCase = Effect.fn("annotationQueues.persistFlaggerAnnotation")(function* (
  input: PersistFlaggerAnnotationInput,
) {
  yield* Effect.annotateCurrentSpan("flagger.id", input.flaggerId)
  yield* Effect.annotateCurrentSpan("flagger.traceId", input.traceId)

  const parsedInput = yield* parseOrBadRequest(flaggerAnnotateInputSchema, input, "Invalid flagger annotate input")

  const projectId = ProjectId(parsedInput.projectId)
  const traceId = TraceId(parsedInput.traceId)
  const flaggerId = parsedInput.flaggerId

  const scoreRepository = yield* ScoreRepository

  const existingDraft = yield* scoreRepository.findFlaggerDraftByTraceAndFlaggerId({
    projectId,
    flaggerId,
    traceId,
  })

  if (existingDraft !== null) {
    return flaggerAnnotateOutputSchema.parse({
      flaggerId,
      traceId: parsedInput.traceId,
      draftAnnotationId: existingDraft.id,
      wasCreated: false,
    }) as FlaggerAnnotateOutput
  }

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
    value: SYSTEM_QUEUE_DRAFT_DEFAULTS.value,
    passed: SYSTEM_QUEUE_DRAFT_DEFAULTS.passed,
    feedback: input.feedback,
    metadata: { rawFeedback: input.feedback },
    error: null,
    draftedAt: new Date(),
  })

  return flaggerAnnotateOutputSchema.parse({
    flaggerId,
    traceId: parsedInput.traceId,
    draftAnnotationId: draft.id,
    wasCreated: true,
  }) as FlaggerAnnotateOutput
})
