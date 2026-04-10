import { AI, AICredentialError, AIError, type GenerateResult } from "@domain/ai"
import { Effect } from "effect"
import { type EvaluationScriptExecution, executeEvaluationScript } from "./alignment-execution.ts"
import {
  EVALUATION_SCRIPT_RUNTIME_MODEL,
  EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT,
  type EvaluationScriptSchema,
  validateEvaluationScript,
} from "./baseline-generation.ts"
import { LiveEvaluationExecutionError } from "./errors.ts"
import { toAlignmentConversationMessages } from "./helpers.ts"

export type ExecuteLiveEvaluationError = AIError | AICredentialError | LiveEvaluationExecutionError

const INVALID_LIVE_EVALUATION_SCRIPT_MESSAGE =
  "Stored evaluation script is not executable by the MVP live evaluation runtime"

export const executeLiveEvaluationUseCase = (input: {
  readonly evaluationId: string
  readonly script: string
  readonly issue: {
    readonly name: string
    readonly description: string
  }
  readonly allMessages: Parameters<typeof toAlignmentConversationMessages>[0]
}) =>
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
    const conversation = toAlignmentConversationMessages(input.allMessages)

    return yield* Effect.tryPromise({
      try: () =>
        executeEvaluationScript({
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
  }) as Effect.Effect<EvaluationScriptExecution, ExecuteLiveEvaluationError>
