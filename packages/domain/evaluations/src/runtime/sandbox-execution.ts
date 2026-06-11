import { AI, AICredentialError, AIError, type GenerateTelemetryCapture, resolveGenerationConfig } from "@domain/ai"
import { buildSchemaFromDescriptor, type HostLlmFunction, isScoreMatch, ScriptRuntime } from "@domain/sandbox"
import { Effect } from "effect"
import { EvaluationExecutionError } from "../errors.ts"
import {
  EVALUATION_DEFAULT_SCRIPT_RUNTIME_MODEL,
  EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT,
  type EvaluationConversationMessage,
  type EvaluationIssueContext,
  type EvaluationScriptExecution,
  estimateEvaluationScriptCostMicrocents,
} from "./evaluation-execution.ts"

const toExecutionError = (error: { readonly message: string; readonly cause?: unknown }) =>
  new EvaluationExecutionError({ message: error.message, cause: "cause" in error ? error.cause : error })

/**
 * Executes a stored evaluation script in the sandbox runtime
 * (`specs/sandbox-runtime.md`, Phase 1). The full script runs — no prompt
 * extraction — while `llm()` reproduces the MVP bridge exactly: same
 * host-managed model, system prompt, and structured-object schema (rebuilt
 * from the script's own `z.object` descriptor), with metering flowing back in
 * the same units as `evaluationExecutionResultSchema`.
 */
export const executeEvaluationScriptSandboxed = Effect.fn("evaluations.executeEvaluationScriptSandboxed")(
  function* (input: {
    readonly script: string
    readonly conversation: readonly EvaluationConversationMessage[]
    readonly issue: EvaluationIssueContext
    readonly telemetry?: GenerateTelemetryCapture
  }) {
    yield* Effect.annotateCurrentSpan("evaluation.conversationMessageCount", input.conversation.length)

    const runtime = yield* ScriptRuntime
    const ai = yield* AI
    const services = yield* Effect.context<never>()
    const modelConfig = yield* resolveGenerationConfig("EVALUATION_JUDGE", EVALUATION_DEFAULT_SCRIPT_RUNTIME_MODEL)

    const compiled = yield* runtime
      .compile({ source: input.script })
      .pipe(Effect.catchTag("ScriptCompileError", (error) => Effect.fail(toExecutionError(error))))

    const llm: HostLlmFunction = async (call) => {
      const schema = buildSchemaFromDescriptor(call.schema)
      const result = await Effect.runPromiseWith(services)(
        ai.generate({
          ...modelConfig,
          system: EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT,
          prompt: call.prompt,
          schema,
          ...(input.telemetry ? { telemetry: input.telemetry } : {}),
        }),
      )

      return {
        object: result.object,
        tokens: result.tokens,
        duration: result.duration,
        cost: estimateEvaluationScriptCostMicrocents(result, modelConfig),
      }
    }

    const runResult = yield* runtime
      .run({
        script: compiled,
        context: { conversation: input.conversation, issue: input.issue },
        llm,
      })
      .pipe(
        Effect.catchTags({
          ScriptRuntimeError: (error) => Effect.fail(toExecutionError(error)),
          ScriptLimitExceededError: (error) => Effect.fail(toExecutionError(error)),
          HostCallError: (error) => {
            if (error.cause instanceof AIError || error.cause instanceof AICredentialError) {
              return Effect.fail(error.cause)
            }
            return Effect.fail(toExecutionError(error))
          },
        }),
      )

    return {
      result: {
        passed: isScoreMatch(runResult.value),
        value: runResult.value,
        feedback: runResult.feedback ?? "",
      },
      totalTokens: runResult.tokens,
      totalDurationNs: runResult.duration,
      totalCostMicrocents: runResult.cost,
    } satisfies EvaluationScriptExecution
  },
)
