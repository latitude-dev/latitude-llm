import { BadRequestError, OrganizationId, type ProjectId, type RepositoryError } from "@domain/shared"
import { resolveScoreTraceContext, resolveTraceIdFromRef, traceRefSchema } from "@domain/spans"
import { Cause, Effect, Exit } from "effect"
import { z } from "zod"
import type { Score } from "../entities/score.ts"
import { customScoreSchema, evaluationScoreSchema } from "../entities/score.ts"
import { ScoreRepository } from "../ports/score-repository.ts"
import { baseWriteScoreInputSchema, type WriteScoreInput, writeScoreUseCase } from "./write-score.ts"

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

const isRepositoryError = (error: unknown): error is RepositoryError =>
  isRecord(error) && error._tag === "RepositoryError" && "cause" in error

// scores_canonical_evaluation_trace_idx; recurses because the driver may nest the raw pg error.
const isCanonicalEvaluationConflict = (cause: unknown): boolean => {
  if (!isRecord(cause)) return false
  if (cause.code === "23505" && cause.constraint === "scores_canonical_evaluation_trace_idx") return true
  return "cause" in cause && isCanonicalEvaluationConflict(cause.cause)
}

const formatValidationError = (error: z.ZodError): string => error.issues.map((issue) => issue.message).join(", ")

const parseOrBadRequest = <T>(schema: z.ZodType<T>, input: unknown, fallbackMessage: string) =>
  Effect.try({
    try: () => schema.parse(input),
    catch: (error: unknown) =>
      new BadRequestError({
        message: error instanceof z.ZodError ? formatValidationError(error) : fallbackMessage,
      }),
  })

/**
 * Common shape shared by both `_evaluation` variants of the public-API score
 * schema (everything except `source`, `sourceId`, and `metadata`, which the
 * discriminated union below pins per variant). Exported so the API route can
 * reuse the same field list when shaping its OpenAPI body schema instead of
 * re-deriving the omit list from `baseWriteScoreInputSchema`.
 *
 * Reuses `baseWriteScoreInputSchema` for the lifecycle fields (value, passed,
 * feedback, error, duration, tokens, cost, simulationId) but drops:
 *
 *   - `id` / `projectId` / `signalId` / `annotatorId` / `draftedAt` — managed
 *     by the platform (`projectId` comes from the URL).
 *   - `traceId` / `sessionId` / `spanId` — replaced by a required `trace`
 *     ref. `traceId` is resolved (by id or filter set), and `sessionId` /
 *     `spanId` are auto-resolved from the trace.
 */
export const baseSubmitApiScoreSchema = baseWriteScoreInputSchema
  .omit({
    id: true,
    projectId: true,
    signalId: true,
    annotatorId: true,
    draftedAt: true,
    traceId: true,
    sessionId: true,
    spanId: true,
  })
  .extend({
    trace: traceRefSchema,
  })

// The public `/scores` wire key stays `source` (the internal field is `sourceType`); the use-case
// maps it when delegating to writeScoreUseCase, so renaming the internal field is not an SDK break.
export const submitApiScoreInputSchema = z.discriminatedUnion("source", [
  baseSubmitApiScoreSchema.extend({
    source: evaluationScoreSchema.shape.sourceType,
    sourceId: evaluationScoreSchema.shape.sourceId,
    metadata: evaluationScoreSchema.shape.metadata,
  }),
  baseSubmitApiScoreSchema.extend({
    source: customScoreSchema.shape.sourceType,
    sourceId: customScoreSchema.shape.sourceId,
    metadata: customScoreSchema.shape.metadata.default({}),
  }),
])

export type SubmitApiScoreInput = z.input<typeof submitApiScoreInputSchema>

interface SubmitApiScoreContext {
  readonly organizationId: string
  readonly projectId: ProjectId
}

/**
 * Public-API entry point for creating a custom or evaluation score.
 *
 * - Resolves the required `trace` ref to a concrete `traceId` (by id or by
 *   filter set, exactly-one-match required for filters).
 * - Auto-resolves `sessionId` (lifted from the trace) and `spanId` (last LLM
 *   completion span on the trace).
 * - Delegates the actual write to `writeScoreUseCase`, which owns issue
 *   discovery, analytics sync, and outbox event emission.
 *
 * Internal callers that already have a resolved `traceId` and want explicit
 * `sessionId` / `spanId` overrides should use `writeScoreUseCase` directly.
 */
export const submitApiScoreUseCase = Effect.fn("scores.submitApiScore")(function* (
  input: SubmitApiScoreInput & SubmitApiScoreContext,
) {
  const parsed = yield* parseOrBadRequest(submitApiScoreInputSchema, input, "Invalid score submission payload")

  const traceId = yield* resolveTraceIdFromRef(parsed.trace, {
    organizationId: input.organizationId,
    projectId: input.projectId,
  })

  const { sessionId, spanId } = yield* resolveScoreTraceContext({
    organizationId: OrganizationId(input.organizationId),
    projectId: input.projectId,
    traceId,
    sessionId: null,
    spanId: null,
  })

  const sharedWriteInput = {
    projectId: input.projectId,
    sessionId,
    traceId,
    spanId,
    simulationId: parsed.simulationId,
    value: parsed.value,
    passed: parsed.passed,
    feedback: parsed.feedback,
    error: parsed.error,
    duration: parsed.duration,
    tokens: parsed.tokens,
    cost: parsed.cost,
  }

  const writeInput: WriteScoreInput =
    parsed.source === "evaluation"
      ? { ...sharedWriteInput, sourceType: "evaluation", sourceId: parsed.sourceId, metadata: parsed.metadata }
      : { ...sharedWriteInput, sourceType: "custom", sourceId: parsed.sourceId, metadata: parsed.metadata }

  const writeExit = yield* Effect.exit(writeScoreUseCase(writeInput))
  if (Exit.isSuccess(writeExit)) {
    return writeExit.value
  }

  // A losing race here already has a winning score in Postgres; return it instead of failing.
  const errorOption = Cause.findErrorOption(writeExit.cause)
  const isDuplicateEvaluationScore =
    parsed.source === "evaluation" &&
    errorOption._tag === "Some" &&
    isRepositoryError(errorOption.value) &&
    isCanonicalEvaluationConflict(errorOption.value.cause)

  if (!isDuplicateEvaluationScore) {
    return yield* writeExit
  }

  const scoreRepository = yield* ScoreRepository
  const existingScore: Score | null = yield* scoreRepository.findByEvaluationIdAndTraceId({
    projectId: input.projectId,
    evaluationId: parsed.sourceId,
    traceId,
  })

  return existingScore ?? (yield* writeExit)
})
