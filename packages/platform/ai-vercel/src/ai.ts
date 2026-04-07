import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { AI, AICredentialError, AICredentials, AIError, type GenerateInput, withAICache } from "@domain/ai"
import { CacheStore } from "@domain/shared"
import { isLatitudeAiProvider, LATITUDE_AI_PROVIDERS } from "@platform/ai-credentials"
import { generateText, type LanguageModel, Output } from "ai"
import { Effect, Layer, Option } from "effect"

type GenerateTextCall = Parameters<typeof generateText>[0]
type ProviderOptions = NonNullable<GenerateTextCall["providerOptions"]>

const DEFAULT_MAX_OUTPUT_TOKENS = 8192

/**
 * Creates a Vercel AI SDK language model for supported providers.
 * Failures are returned on the Effect error channel (no synchronous throw for expected cases).
 */
export const createProviderModel = (
  provider: string,
  model: string,
  apiKey: string,
): Effect.Effect<LanguageModel, AICredentialError> => {
  if (!isLatitudeAiProvider(provider)) {
    return Effect.fail(
      new AICredentialError({
        provider,
        message: `Unsupported AI provider "${provider}" for Latitude-managed credentials. Use a supported provider or configure credentials for this provider.`,
        statusCode: 400,
      }),
    )
  }
  switch (provider) {
    case LATITUDE_AI_PROVIDERS.anthropic:
      return Effect.succeed(createAnthropic({ apiKey })(model))
    case LATITUDE_AI_PROVIDERS.openai:
      return Effect.succeed(createOpenAI({ apiKey })(model))
  }
}

/**
 * Vercel AI SDK adapter providing the `generate` capability of the AI service.
 *
 * `embed` and `rerank` are left to the Voyage adapter — compose both Layers
 * at the application boundary to get a complete AI service.
 */
export const AIGenerateLive = Layer.effect(
  AI,
  Effect.gen(function* () {
    const credentials = yield* AICredentials
    const cache = yield* Effect.serviceOption(CacheStore)

    const ai = {
      generate: <T>(input: GenerateInput<T>) =>
        Effect.gen(function* () {
          const apiKey = yield* credentials.getApiKey(input.provider)
          const model = yield* createProviderModel(input.provider, input.model, apiKey)

          return yield* Effect.tryPromise({
            try: async () => {
              const startTime = performance.now()

              const call: GenerateTextCall = {
                model,
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
