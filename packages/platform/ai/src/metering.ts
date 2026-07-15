import {
  type AICredentialError,
  AIError,
  type AIShape,
  type EmbedInput,
  type EmbedResult,
  type GenerateInput,
  type GenerateResult,
} from "@domain/ai"
import {
  type AIMeteringRecordError,
  AIMeteringScope,
  type AIMeteringScopeShape,
  creditsForLlmGenerationCost,
} from "@domain/billing"
import { estimateTotalCost, getCostSpec } from "@domain/models"
import { Effect, Option } from "effect"

const toAIError = (cause: AIMeteringRecordError): AIError => new AIError({ message: cause.httpMessage, cause })

/**
 * Charges AI primitives against the ambient `AIMeteringScope`. Generations bill
 * their estimated provider cost (registry pricing x reported token usage) through
 * `creditsForLlmGenerationCost`; when the registry has no pricing for the model or
 * the provider reported no usage, the flat `llm-call` price applies instead. Each
 * query-time embedding bills one flat `semantic-query`. Document embeddings and
 * reranking ride on the charge of the operation that produced them. Without a scope
 * in context the call passes through unbilled.
 *
 * Sits under `withAICache` so cache hits, which cost no provider tokens, are never
 * charged. Generations are recorded on success and on `AIError` (the provider call
 * was attempted and tokens may have been consumed — flat price, no usage to bill)
 * but not on `AICredentialError` (no call was made).
 */
export const withAIMetering = (ai: AIShape): AIShape => ({
  generate: <T>(input: GenerateInput<T>): Effect.Effect<GenerateResult<T>, AIError | AICredentialError> =>
    Effect.serviceOption(AIMeteringScope).pipe(
      Effect.flatMap((scope) => {
        if (Option.isNone(scope)) {
          return ai.generate(input)
        }

        const recordFlat = recordScoped(scope.value, {
          action: "llm-call",
          metadata: { provider: input.provider, model: input.model },
        })

        return ai.generate(input).pipe(
          Effect.tap((result) => recordGeneration(scope.value, input, result)),
          Effect.tapError((error) => (error._tag === "AIError" ? recordFlat : Effect.void)),
        )
      }),
    ),

  embed: (input: EmbedInput): Effect.Effect<EmbedResult, AIError> =>
    Effect.serviceOption(AIMeteringScope).pipe(
      Effect.flatMap((scope) => {
        if (Option.isNone(scope) || input.inputType !== "query") {
          return ai.embed(input)
        }

        return ai.embed(input).pipe(
          Effect.tap(() =>
            recordScoped(scope.value, {
              action: "semantic-query",
              metadata: { provider: input.provider, model: input.model },
            }),
          ),
        )
      }),
    ),

  rerank: ai.rerank,
})

const recordGeneration = <T>(
  scope: AIMeteringScopeShape,
  input: GenerateInput<T>,
  result: GenerateResult<T>,
): Effect.Effect<void, AIError> => {
  const usage = result.tokenUsage
  const costSpec = getCostSpec(input.provider, input.model)

  if (usage === undefined || !costSpec.costImplemented) {
    return Effect.logWarning("AI metering: no usage or registry pricing for model; billing flat llm-call price", {
      provider: input.provider,
      model: input.model,
      hasUsage: usage !== undefined,
      costImplemented: costSpec.costImplemented,
    }).pipe(
      Effect.andThen(
        recordScoped(scope, {
          action: "llm-call",
          metadata: { provider: input.provider, model: input.model, pricing: "flat-fallback" },
        }),
      ),
    )
  }

  const estimatedCostUsd = estimateTotalCost(costSpec.cost, usage)
  return recordScoped(scope, {
    action: "llm-call",
    credits: creditsForLlmGenerationCost(estimatedCostUsd),
    metadata: {
      provider: input.provider,
      model: input.model,
      pricing: "cost-based",
      estimatedCostUsd,
      tokensInput: usage.input,
      tokensOutput: usage.output,
      ...(usage.reasoning !== undefined ? { tokensReasoning: usage.reasoning } : {}),
      ...(usage.cacheRead !== undefined ? { tokensCacheRead: usage.cacheRead } : {}),
      ...(usage.cacheWrite !== undefined ? { tokensCacheWrite: usage.cacheWrite } : {}),
    },
  })
}

const recordScoped = (
  scope: AIMeteringScopeShape,
  input: Parameters<AIMeteringScopeShape["record"]>[0],
): Effect.Effect<void, AIError> => scope.record(input).pipe(Effect.mapError(toAIError))
