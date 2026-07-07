import {
  type AICredentialError,
  AIError,
  type AIShape,
  type EmbedInput,
  type EmbedResult,
  type GenerateInput,
  type GenerateResult,
} from "@domain/ai"
import { type AIMeteringRecordError, AIMeteringScope, type AIMeteringScopeShape } from "@domain/billing"
import { Effect, Option } from "effect"

const toAIError = (cause: AIMeteringRecordError): AIError => new AIError({ message: cause.httpMessage, cause })

/**
 * Charges AI primitives against the ambient `AIMeteringScope`: one `llm-call` per
 * generation, one `semantic-query` per query-time embedding. Document embeddings and
 * reranking ride on the charge of the operation that produced them. Without a scope
 * in context the call passes through unbilled.
 *
 * Sits under `withAICache` so cache hits, which cost no provider tokens, are never
 * charged. Generations are recorded on success and on `AIError` (the provider call
 * was attempted and tokens may have been consumed) but not on `AICredentialError`
 * (no call was made).
 */
export const withAIMetering = (ai: AIShape): AIShape => ({
  generate: <T>(input: GenerateInput<T>): Effect.Effect<GenerateResult<T>, AIError | AICredentialError> =>
    Effect.serviceOption(AIMeteringScope).pipe(
      Effect.flatMap((scope) => {
        if (Option.isNone(scope)) {
          return ai.generate(input)
        }

        const record = recordScoped(scope.value, {
          action: "llm-call",
          metadata: { provider: input.provider, model: input.model },
        })

        return ai.generate(input).pipe(
          Effect.tap(() => record),
          Effect.tapError((error) => (error._tag === "AIError" ? record : Effect.void)),
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

const recordScoped = (
  scope: AIMeteringScopeShape,
  input: Parameters<AIMeteringScopeShape["record"]>[0],
): Effect.Effect<void, AIError> => scope.record(input).pipe(Effect.mapError(toAIError))
