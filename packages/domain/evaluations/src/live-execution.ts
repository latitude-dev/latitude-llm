import { AI, AICredentialError, AIError, type GenerateResult } from "@domain/ai"
import { type TraceDetail, traceDetailSchema } from "@domain/spans"
import { Effect } from "effect"
import { z } from "zod"
import { executeEvaluationScript } from "./alignment-execution.ts"
import {
  EVALUATION_SCRIPT_RUNTIME_MODEL,
  EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT,
  type EvaluationScriptSchema,
  validateEvaluationScript,
} from "./baseline-generation.ts"
import { evaluationSchema } from "./entities/evaluation.ts"
import { LiveEvaluationExecutionError } from "./errors.ts"
import { toAlignmentConversationMessages } from "./helpers.ts"

export type ExecuteLiveEvaluationError = AIError | AICredentialError | LiveEvaluationExecutionError

const INVALID_LIVE_EVALUATION_SCRIPT_MESSAGE =
  "Stored evaluation script is not executable by the MVP live evaluation runtime"

export const liveEvaluationIssueContextSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
})
export type LiveEvaluationIssueContext = z.infer<typeof liveEvaluationIssueContextSchema>

export const liveEvaluationConversationInputSchema = traceDetailSchema.shape.allMessages
export type LiveEvaluationConversationInput = TraceDetail["allMessages"]

export const liveEvaluationResultPayloadSchema = z.object({
  passed: z.boolean(),
  value: z.number().min(0).max(1),
  feedback: z.string(),
})
export type LiveEvaluationResultPayload = z.infer<typeof liveEvaluationResultPayloadSchema>

export const liveEvaluationExecutionInputSchema = z.object({
  evaluationId: evaluationSchema.shape.id,
  script: evaluationSchema.shape.script,
  issue: liveEvaluationIssueContextSchema,
  conversation: liveEvaluationConversationInputSchema,
})
export type LiveEvaluationExecutionInput = z.infer<typeof liveEvaluationExecutionInputSchema>

export const liveEvaluationExecutionResultSchema = z.object({
  result: liveEvaluationResultPayloadSchema,
  duration: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
  cost: z.number().int().nonnegative(),
})
export type LiveEvaluationExecutionResult = z.infer<typeof liveEvaluationExecutionResultSchema>

const toLiveEvaluationExecutionResult = (input: {
  readonly result: Awaited<ReturnType<typeof executeEvaluationScript>>
}): LiveEvaluationExecutionResult =>
  liveEvaluationExecutionResultSchema.parse({
    result: input.result.result,
    duration: input.result.totalDurationNs,
    tokens: input.result.totalTokens,
    cost: input.result.totalCostMicrocents,
  })

export const executeLiveEvaluationUseCase = (input: LiveEvaluationExecutionInput) =>
  Effect.gen(function* () {
    if (!validateEvaluationScript(input.script)) {
      return yield* Effect.fail(
        new LiveEvaluationExecutionError({
          evaluationId: input.evaluationId,
          message: INVALID_LIVE_EVALUATION_SCRIPT_MESSAGE,
        }),
      )
    }

    const ai = yield* AI
    const services = yield* Effect.services<never>()
    const conversation = toAlignmentConversationMessages(input.conversation)

    return yield* Effect.tryPromise({
      try: async () =>
        toLiveEvaluationExecutionResult({
          result: await executeEvaluationScript({
            script: input.script,
            conversation,
            issue: input.issue,
            generateStructuredObject: <T>(llmInput: {
              readonly prompt: string
              readonly schema: EvaluationScriptSchema<T>
            }): Promise<GenerateResult<T>> =>
              Effect.runPromiseWith(services)(
                ai.generate({
                  ...EVALUATION_SCRIPT_RUNTIME_MODEL,
                  system: EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT,
                  prompt: llmInput.prompt,
                  schema: llmInput.schema,
                }),
              ),
          }),
        }),
      catch: (error) => {
        if (error instanceof AIError || error instanceof AICredentialError) {
          return error
        }

        return new LiveEvaluationExecutionError({
          evaluationId: input.evaluationId,
          message: error instanceof Error ? error.message : "Live evaluation execution failed",
          cause: error,
        })
      },
    })
  }) as Effect.Effect<LiveEvaluationExecutionResult, ExecuteLiveEvaluationError>
