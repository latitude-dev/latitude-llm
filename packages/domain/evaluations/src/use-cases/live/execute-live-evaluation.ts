import type { AI, AICredentialError, AIError } from "@domain/ai"
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

export type ExecuteLiveEvaluationError = AIError | AICredentialError | LiveEvaluationExecutionError

const INVALID_LIVE_EVALUATION_SCRIPT_MESSAGE =
  "Stored evaluation script is not executable by the MVP live evaluation runtime"

export const liveEvaluationIssueContextSchema = evaluationIssueContextSchema
export type LiveEvaluationIssueContext = EvaluationIssueContext

export const liveEvaluationConversationInputSchema = traceDetailSchema.shape.allMessages
export type LiveEvaluationConversationInput = TraceDetail["allMessages"]

export const liveEvaluationResultPayloadSchema = evaluationExecutionResultPayloadSchema
export type LiveEvaluationResultPayload = EvaluationExecutionResultPayload

export const liveEvaluationExecutionInputSchema = z.object({
  evaluationId: evaluationSchema.shape.id,
  script: evaluationSchema.shape.script,
  issue: liveEvaluationIssueContextSchema,
  conversation: liveEvaluationConversationInputSchema,
})
export type LiveEvaluationExecutionInput = z.infer<typeof liveEvaluationExecutionInputSchema>

export const liveEvaluationExecutionResultSchema = evaluationExecutionResultSchema
export type LiveEvaluationExecutionResult = EvaluationExecutionResult

export const executeLiveEvaluationUseCase = (input: LiveEvaluationExecutionInput) =>
  Effect.gen(function* () {
    if (!validateEvaluationScript(input.script)) {
      return yield* new LiveEvaluationExecutionError({
        evaluationId: input.evaluationId,
        message: INVALID_LIVE_EVALUATION_SCRIPT_MESSAGE,
      })
    }

    const conversation = toEvaluationConversationMessages(input.conversation)

    const execution = yield* executeEvaluationScriptWithAI({
      script: input.script,
      conversation,
      issue: input.issue,
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
  }) as Effect.Effect<LiveEvaluationExecutionResult, ExecuteLiveEvaluationError, AI>
