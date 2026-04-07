import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { AI, AICredentials, AIError, type GenerateInput, withAICache } from "@domain/ai"
import { CacheStore } from "@domain/shared"
import { isLatitudeAiProvider, LATITUDE_AI_PROVIDERS } from "@platform/ai-credentials"
import { runWithAiTelemetry } from "@platform/ai-latitude"
import { generateText, Output } from "ai"
import { Effect, Layer, Option } from "effect"

type GenerateTextCall = Parameters<typeof generateText>[0]
type ProviderOptions = NonNullable<GenerateTextCall["providerOptions"]>
type ProviderModel = GenerateTextCall["model"]

const DEFAULT_MAX_OUTPUT_TOKENS = 8192

/**
 * Creates a Vercel AI SDK language model for supported providers.
 * Failures are returned on the Effect error channel (no synchronous throw for expected cases).
 */
export const createProviderModel = (provider: string, model: string, apiKey: string): ProviderModel => {
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(model)
    case "openai":
      return createOpenAI({ apiKey })(model)
    default:
      throw new Error(`Unsupported AI provider "${provider}".`)
  }
}

export const AIVercelLive = Layer.effect(
  AI,
  Effect.gen(function* () {
    const credentials = yield* AICredentials
    const maybeCache = yield* Effect.serviceOption(CacheStore)
    const cache = Option.fromNullable(maybeCache)

    const ai = {
      generate: <T>(input: GenerateInput<T>): Effect.Effect<GenerateResult<T>, AIError | AICredentialError> =>
        Effect.gen(function* () {
          const isLatitude = isLatitudeAiProvider(input.provider)
          const apiKey = yield* credentials.get(input.provider)

          return yield* Effect.tryPromise({
            try: async () => {
              const execute = async () => {
                const startTime = performance.now()

                const call: GenerateTextCall = {
                  model: createProviderModel(input.provider, input.model, apiKey),
                  system: input.system,
                  prompt: input.prompt,
                  output: Output.object({ schema: input.schema }),
                  reasoning: input.reasoning ?? "provider-default",
                  maxOutputTokens: input.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
                  ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
                  ...(input.topP !== undefined ? { topP: input.topP } : {}),
                  ...(input.topK !== undefined ? { topK: input.topK } : {}),
                  ...(input.presencePenalty !== undefined ? { presencePenalty: input.presencePenalty } : {}),
                  ...(input.frequencyPenalty !== undefined ? { frequencyPenalty: input.frequencyPenalty } : {}),
                  ...(input.stopSequences !== undefined ? { stopSequences: [...input.stopSequences] } : {}),
                  ...(input.seed !== undefined ? { seed: input.seed } : {}),
                  providerOptions: input.providerOptions as ProviderOptions,
                }

                const result = await generateText(call)

                const durationNs = Math.round((performance.now() - startTime) * 1_000_000)

                return {
                  object: result.output,
                  tokens: result.usage?.totalTokens ?? 0,
                  duration: durationNs,
                }
              }

              return await runWithAiTelemetry(input.telemetry, execute)
            },
            catch: (error) =>
              new AIError({
                message: `AI generation failed (${input.provider}/${input.model}): ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
              }),
          })
        }),

      embed: () => Effect.fail(new AIError({ message: "embed is not provided by @platform/ai-vercel" })),

      rerank: () => Effect.fail(new AIError({ message: "rerank is not provided by @platform/ai-vercel" })),
    }

    return Option.match(cache, {
      onNone: () => ai,
      onSome: (aiCache) => withAICache(ai, aiCache),
    })
  }),
)
