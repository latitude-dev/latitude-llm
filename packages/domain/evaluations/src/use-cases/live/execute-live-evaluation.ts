import type { AI, AICredentialError, AIError, GenerateTelemetryCapture } from "@domain/ai"
import type { ScriptRuntime } from "@domain/sandbox"
import { type TraceDetail, traceDetailSchema } from "@domain/spans"
import { Effect } from "effect"
import { z } from "zod"
import { evaluationSchema } from "../../entities/evaluation.ts"
import { LiveEvaluationExecutionError } from "../../errors.ts"
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
  validateEvaluationScript,
} from "../../runtime/evaluation-execution.ts"
import { executeEvaluationScriptSandboxed } from "../../runtime/sandbox-execution.ts"

export type ExecuteLiveEvaluationError = AIError | AICredentialError | LiveEvaluationExecutionError

const INVALID_LIVE_EVALUATION_SCRIPT_MESSAGE =
  "Stored evaluation script is not executable by the MVP live evaluation runtime"

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

/**
 * `legacy` is the template-extraction MVP bridge; `sandbox` compiles and runs
 * the full stored script in the sandbox runtime (`specs/sandbox-runtime.md`).
 * Callers derive the choice from the `evaluation-sandbox-runtime` flag.
 */
export const liveEvaluationRuntimeSchema = z.enum(["legacy", "sandbox"])
export type LiveEvaluationRuntime = z.infer<typeof liveEvaluationRuntimeSchema>

export const liveEvaluationExecutionInputSchema = z.object({
  evaluationId: evaluationSchema.shape.id,
  script: evaluationSchema.shape.script,
  issue: liveEvaluationIssueContextSchema,
  conversation: liveEvaluationConversationInputSchema,
  telemetry: liveEvaluationExecutionTelemetrySchema.optional(),
  runtime: liveEvaluationRuntimeSchema.optional(),
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
    const runtime = input.runtime ?? "legacy"
    yield* Effect.annotateCurrentSpan("evaluation.runtime", runtime)

    // The sandbox runtime executes the full script, so the template-only
    // constraint applies to the legacy extract-and-call bridge alone.
    if (runtime === "legacy" && !validateEvaluationScript(input.script)) {
      return yield* new LiveEvaluationExecutionError({
        evaluationId: input.evaluationId,
        message: INVALID_LIVE_EVALUATION_SCRIPT_MESSAGE,
      })
    }

    const conversation = toEvaluationConversationMessages(input.conversation)
    const telemetry = toGenerateTelemetryCapture(input.telemetry)

    const scriptExecutionInput = {
      script: input.script,
      conversation,
      issue: input.issue,
      ...(telemetry ? { telemetry } : {}),
    }
    const execution = yield* (
      runtime === "sandbox"
        ? executeEvaluationScriptSandboxed(scriptExecutionInput)
        : executeEvaluationScriptWithAI(scriptExecutionInput)
    ).pipe(
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
    AI | ScriptRuntime
  >
