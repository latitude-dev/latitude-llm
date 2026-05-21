import type { GenerateTelemetryCapture } from "@domain/ai"
import { type TraceDetail, traceDetailSchema } from "@domain/spans"
import { Effect } from "effect"
import { z } from "zod"
import { evaluationSchema } from "../../entities/evaluation.ts"
import { type EvaluationExecutionError, LiveEvaluationExecutionError } from "../../errors.ts"
import type { EvaluationRuntimeMetadata, EvaluationScriptRuntime } from "../../ports/evaluation-script-runtime.ts"
import {
  type EvaluationExecutionResult,
  type EvaluationExecutionResultPayload,
  type EvaluationIssueContext,
  evaluationExecutionResultPayloadSchema,
  evaluationExecutionResultSchema,
  evaluationIssueContextSchema,
  executeEvaluationScriptWithAI,
  toEvaluationConversationMessages,
  toEvaluationExecutionResult,
} from "../../runtime/evaluation-execution.ts"

export type ExecuteLiveEvaluationError = EvaluationExecutionError | LiveEvaluationExecutionError

export const liveEvaluationIssueContextSchema = evaluationIssueContextSchema
export type LiveEvaluationIssueContext = EvaluationIssueContext

export const liveEvaluationConversationInputSchema = traceDetailSchema.shape.allMessages
export type LiveEvaluationConversationInput = TraceDetail["allMessages"]

export const liveEvaluationResultPayloadSchema = evaluationExecutionResultPayloadSchema
export type LiveEvaluationResultPayload = EvaluationExecutionResultPayload

const liveEvaluationExecutionTelemetrySchema = z.object({
  spanName: z.string().min(1),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const liveEvaluationRuntimeMetadataSchema = z.object({
  duration: z.number().int().nonnegative(),
  usage: z.object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
    reasoning: z.number().int().nonnegative(),
    cacheRead: z.number().int().nonnegative(),
    cacheWrite: z.number().int().nonnegative(),
  }),
  cost: z.number().int().nonnegative(),
  turns: z.number().int().nonnegative(),
  traceId: z.string().min(1).nullable().optional(),
  sessionId: z.string().min(1).nullable().optional(),
  spanId: z.string().min(1).nullable().optional(),
  simulationId: z.string().min(1).nullable().optional(),
}) satisfies z.ZodType<EvaluationRuntimeMetadata>

export const liveEvaluationExecutionInputSchema = z.object({
  evaluationId: evaluationSchema.shape.id,
  script: evaluationSchema.shape.script,
  issue: liveEvaluationIssueContextSchema,
  conversation: liveEvaluationConversationInputSchema,
  metadata: liveEvaluationRuntimeMetadataSchema.optional(),
  telemetry: liveEvaluationExecutionTelemetrySchema.optional(),
})
export type LiveEvaluationExecutionInput = z.infer<typeof liveEvaluationExecutionInputSchema>

export const liveEvaluationExecutionResultSchema = evaluationExecutionResultSchema
export type LiveEvaluationExecutionResult = EvaluationExecutionResult

const toGenerateTelemetryCapture = (
  telemetry: LiveEvaluationExecutionInput["telemetry"],
): GenerateTelemetryCapture | undefined => {
  if (!telemetry) return undefined

  return {
    spanName: telemetry.spanName,
    ...(telemetry.tags ? { tags: [...telemetry.tags] } : {}),
    ...(telemetry.metadata ? { metadata: { ...telemetry.metadata } } : {}),
  }
}

export const executeLiveEvaluationUseCase = (input: LiveEvaluationExecutionInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("evaluation.id", input.evaluationId)

    const conversation = toEvaluationConversationMessages(input.conversation)
    const telemetry = toGenerateTelemetryCapture(input.telemetry)

    const execution = yield* executeEvaluationScriptWithAI({
      script: input.script,
      conversation,
      issue: input.issue,
      ...(input.metadata ? { metadata: input.metadata } : {}),
      ...(telemetry ? { telemetry } : {}),
    }).pipe(
      Effect.catchTag("EvaluationExecutionError", (error) =>
        Effect.fail(
          new LiveEvaluationExecutionError({
            evaluationId: input.evaluationId,
            message: error.message,
            cause: error.cause,
          }),
        ),
      ),
    )

    return yield* Effect.try({
      try: () => toEvaluationExecutionResult(execution),
      catch: (error) =>
        new LiveEvaluationExecutionError({
          evaluationId: input.evaluationId,
          message: error instanceof Error ? error.message : "Live evaluation execution failed",
          cause: error,
        }),
    })
  }).pipe(Effect.withSpan("evaluations.executeLiveEvaluation")) as Effect.Effect<
    LiveEvaluationExecutionResult,
    ExecuteLiveEvaluationError,
    EvaluationScriptRuntime
  >
