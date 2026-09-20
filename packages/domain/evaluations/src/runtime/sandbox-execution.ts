import {
  AI,
  AIClassify,
  AICredentialError,
  AIError,
  type GenerateTelemetryCapture,
  resolveGenerationConfig,
} from "@domain/ai"
import { AIMeteringScope, creditsForLlmGenerationCost } from "@domain/billing"
import {
  buildSchemaFromDescriptor,
  type HostClassifierFunction,
  type HostLlmFunction,
  type HostSimilarityFunction,
  isScoreMatch,
  ScriptRuntime,
  type ScriptSessionContext,
} from "@domain/sandbox"
import { Effect, Option } from "effect"
import { EvaluationExecutionError } from "../errors.ts"
import {
  EVALUATION_DEFAULT_SCRIPT_RUNTIME_MODEL,
  EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT,
  type EvaluationScriptExecution,
  estimateEvaluationScriptCostMicrocents,
  fitPromptToJudgeContextWindow,
} from "./evaluation-execution.ts"

const MICROCENTS_PER_USD = 100_000_000

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
    readonly session: ScriptSessionContext
    readonly telemetry?: GenerateTelemetryCapture
    /**
     * Host verb backing `semanticSimilarity()`. Built by the live/preview callers (which own the
     * session/org/project); installed only for embedding-capability scripts. Omitted where semantic
     * similarity is not supported (e.g. optimization candidates), so the runtime guard rejects an
     * embedding script that arrives without it.
     */
    readonly similarity?: HostSimilarityFunction
  }) {
    yield* Effect.annotateCurrentSpan("evaluation.conversationMessageCount", input.session.conversation.length)

    const runtime = yield* ScriptRuntime
    const ai = yield* AI
    const classifierService = yield* Effect.serviceOption(AIClassify)
    const meteringScope = yield* Effect.serviceOption(AIMeteringScope)
    const services = yield* Effect.context<never>()
    const modelConfig = yield* resolveGenerationConfig("EVALUATION_JUDGE", EVALUATION_DEFAULT_SCRIPT_RUNTIME_MODEL)

    const compiled = yield* runtime
      .compile({ source: input.script })
      .pipe(Effect.catchTag("ScriptCompileError", (error) => Effect.fail(toExecutionError(error))))

    const llm: HostLlmFunction = async (call) => {
      const schema = buildSchemaFromDescriptor(call.schema)
      const prompt = fitPromptToJudgeContextWindow(
        call.prompt,
        modelConfig.provider,
        modelConfig.model,
        modelConfig.maxTokens,
      )
      const result = await Effect.runPromiseWith(services)(
        ai.generate({
          ...modelConfig,
          system: EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT,
          prompt,
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

    const classifier: HostClassifierFunction | undefined = Option.isSome(classifierService)
      ? async (call) => {
          const result = await Effect.runPromiseWith(services)(
            classifierService.value.classify({
              state: input.session,
              instructions: call.instructions,
              criteria: call.criteria,
            }),
          )
          if (Option.isSome(meteringScope)) {
            await Effect.runPromiseWith(services)(
              meteringScope.value
                .record({
                  action: "llm-call",
                  credits: creditsForLlmGenerationCost(result.cost / MICROCENTS_PER_USD),
                  metadata: {
                    provider: result.servedBy.provider,
                    model: result.servedBy.model,
                    pricing: "cost-based",
                    estimatedCostUsd: result.cost / MICROCENTS_PER_USD,
                    source: "evaluation-classifier",
                    ...(result.tokenUsage
                      ? { tokensInput: result.tokenUsage.input, tokensOutput: result.tokenUsage.output }
                      : {}),
                  },
                })
                .pipe(
                  Effect.mapError(
                    (cause) => new AIError({ message: "Failed to record Jev classification usage", cause }),
                  ),
                ),
            )
          }
          return result
        }
      : undefined

    const runResult = yield* runtime
      .run({
        script: compiled,
        context: { session: input.session },
        llm,
        ...(classifier ? { classifier } : {}),
        ...(input.similarity ? { similarity: input.similarity } : {}),
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
