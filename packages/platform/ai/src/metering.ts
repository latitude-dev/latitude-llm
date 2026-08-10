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
  creditsForSemanticQueryCost,
  type MeteredAIAction,
  semanticQueryEmbedCostUsd,
} from "@domain/billing"
import { estimateTotalCost, getCostSpec } from "@domain/models"
import { Effect, Option } from "effect"

const toAIError = (cause: AIMeteringRecordError): AIError => new AIError({ message: cause.httpMessage, cause })

/**
 * Charges AI primitives against the ambient `AIMeteringScope`. Generations bill their
 * estimated provider cost (registry pricing of the model that served the call, per
 * `result.servedBy`, x reported token usage) through `creditsForLlmGenerationCost`;
 * when the registry has no pricing for the model or the provider reported no usage,
 * the flat `llm-call` price applies instead.
 * Each query-time embedding bills one `semantic-query` at its estimated embed cost through
 * `creditsForSemanticQueryCost`, falling back to the flat price when the adapter
 * reports no token count. Document embeddings and reranking ride on the charge of
 * the operation that produced them. Without a scope in context the call passes
 * through unbilled.
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

        const recordFlat = reportPricingFallback({
          action: "llm-call",
          provider: input.provider,
          model: input.model,
          reason: "provider call failed after attempt; no usage to price",
        }).pipe(
          Effect.andThen(
            recordScoped(scope.value, {
              action: "llm-call",
              metadata: { provider: input.provider, model: input.model, pricing: "flat-fallback" },
            }),
          ),
        )

        // tapError attaches before tap so it only sees provider failures — a
        // failed recordGeneration must not also commit the flat fallback record.
        return ai.generate(input).pipe(
          Effect.tapError((error) => (error._tag === "AIError" ? recordFlat : Effect.void)),
          Effect.tap((result) => recordGeneration(scope.value, input, result)),
        )
      }),
    ),

  embed: (input: EmbedInput): Effect.Effect<EmbedResult, AIError> =>
    Effect.serviceOption(AIMeteringScope).pipe(
      Effect.flatMap((scope) => {
        if (Option.isNone(scope) || input.inputType !== "query") {
          return ai.embed(input)
        }

        return ai.embed(input).pipe(Effect.tap((result) => recordSemanticQuery(scope.value, input, result)))
      }),
    ),

  rerank: ai.rerank,
})

const reportPricingFallback = (input: {
  readonly action: MeteredAIAction
  readonly provider: string
  readonly model: string
  readonly reason: string
  readonly details?: Record<string, unknown>
}): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Effect.logWarning(`AI metering: ${input.reason}; billing flat ${input.action} price`, {
      provider: input.provider,
      model: input.model,
      ...input.details,
    })
    yield* Effect.annotateCurrentSpan("billing.pricing", "flat-fallback")
    yield* Effect.annotateCurrentSpan("billing.action", input.action)
    yield* Effect.annotateCurrentSpan("billing.provider", input.provider)
    yield* Effect.annotateCurrentSpan("billing.model", input.model)
  })

const recordGeneration = <T>(
  scope: AIMeteringScopeShape,
  input: GenerateInput<T>,
  result: GenerateResult<T>,
): Effect.Effect<void, AIError> => {
  const usage = result.tokenUsage
  const servedBy = result.servedBy ?? { provider: input.provider, model: input.model }
  const costSpec = getCostSpec(servedBy.provider, servedBy.model)
  const requestedModel =
    servedBy.provider === input.provider && servedBy.model === input.model
      ? {}
      : { requestedModel: `${input.provider}/${input.model}` }

  if (usage === undefined || !costSpec.costImplemented) {
    return reportPricingFallback({
      action: "llm-call",
      provider: servedBy.provider,
      model: servedBy.model,
      reason: "no usage or registry pricing for model",
      details: { hasUsage: usage !== undefined, costImplemented: costSpec.costImplemented, ...requestedModel },
    }).pipe(
      Effect.andThen(
        recordScoped(scope, {
          action: "llm-call",
          metadata: { provider: servedBy.provider, model: servedBy.model, pricing: "flat-fallback", ...requestedModel },
        }),
      ),
    )
  }

  const estimatedCostUsd = estimateTotalCost(costSpec.cost, usage)
  return recordScoped(scope, {
    action: "llm-call",
    credits: creditsForLlmGenerationCost(estimatedCostUsd),
    metadata: {
      provider: servedBy.provider,
      model: servedBy.model,
      ...requestedModel,
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

const recordSemanticQuery = (
  scope: AIMeteringScopeShape,
  input: EmbedInput,
  result: EmbedResult,
): Effect.Effect<void, AIError> => {
  if (result.tokens === undefined) {
    return reportPricingFallback({
      action: "semantic-query",
      provider: input.provider,
      model: input.model,
      reason: "embed adapter reported no token usage",
    }).pipe(
      Effect.andThen(
        recordScoped(scope, {
          action: "semantic-query",
          metadata: { provider: input.provider, model: input.model, pricing: "flat-fallback" },
        }),
      ),
    )
  }

  const estimatedCostUsd = semanticQueryEmbedCostUsd(result.tokens)
  return recordScoped(scope, {
    action: "semantic-query",
    credits: creditsForSemanticQueryCost(estimatedCostUsd),
    metadata: {
      provider: input.provider,
      model: input.model,
      pricing: "cost-based",
      estimatedCostUsd,
      tokens: result.tokens,
    },
  })
}

const recordScoped = (
  scope: AIMeteringScopeShape,
  input: Parameters<AIMeteringScopeShape["record"]>[0],
): Effect.Effect<void, AIError> => scope.record(input).pipe(Effect.mapError(toAIError))
