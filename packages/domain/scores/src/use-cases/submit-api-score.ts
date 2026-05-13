import { BadRequestError, OrganizationId, type ProjectId } from "@domain/shared"
import { resolveScoreTraceContext, resolveTraceIdFromRef, traceRefSchema } from "@domain/spans"
import { Effect } from "effect"
import { z } from "zod"
import { customScoreSchema, evaluationScoreSchema } from "../entities/score.ts"
import { baseWriteScoreInputSchema, type WriteScoreInput, writeScoreUseCase } from "./write-score.ts"

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
 *   - `id` / `projectId` / `issueId` / `annotatorId` / `draftedAt` — managed
 *     by the platform (`projectId` comes from the URL).
 *   - `traceId` / `sessionId` / `spanId` — replaced by a required `trace`
 *     ref. `traceId` is resolved (by id or filter set), and `sessionId` /
 *     `spanId` are auto-resolved from the trace.
 */
export const baseSubmitApiScoreSchema = baseWriteScoreInputSchema
  .omit({
    id: true,
    projectId: true,
    issueId: true,
    annotatorId: true,
    draftedAt: true,
    traceId: true,
    sessionId: true,
    spanId: true,
  })
  .extend({
    trace: traceRefSchema,
  })

export const submitApiScoreInputSchema = z.discriminatedUnion("source", [
  baseSubmitApiScoreSchema.extend({
    source: evaluationScoreSchema.shape.source,
    sourceId: evaluationScoreSchema.shape.sourceId,
    metadata: evaluationScoreSchema.shape.metadata,
  }),
  baseSubmitApiScoreSchema.extend({
    source: customScoreSchema.shape.source,
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
      ? { ...sharedWriteInput, source: "evaluation", sourceId: parsed.sourceId, metadata: parsed.metadata }
      : { ...sharedWriteInput, source: "custom", sourceId: parsed.sourceId, metadata: parsed.metadata }

  return yield* writeScoreUseCase(writeInput)
})
