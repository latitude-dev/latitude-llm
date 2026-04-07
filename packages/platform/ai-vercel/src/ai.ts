import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import {
  AICredentialError,
  AIError,
  AIGenerate,
  type AIGenerateShape,
  type GenerateInput,
  type GenerateResult,
} from "@domain/ai"
import { parseEnv } from "@platform/env"
import { generateText, Output } from "ai"
import { Effect, Layer } from "effect"

type GenerateTextCall = Parameters<typeof generateText>[0]
type ProviderOptions = NonNullable<GenerateTextCall["providerOptions"]>
type ProviderModel = GenerateTextCall["model"]

const DEFAULT_MAX_OUTPUT_TOKENS = 8192

const getProviderEnvKey = (provider: string) => `LAT_${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`

const getProviderApiKey = (provider: string): Effect.Effect<string, AICredentialError> => {
  const envKey = getProviderEnvKey(provider)

  return parseEnv(envKey, "string").pipe(
    Effect.mapError(
      () =>
        new AICredentialError({
          provider,
          message: `AI is unavailable: no API key for provider "${provider}". Set ${envKey}.`,
        }),
    ),
  )
}

/**
 * Creates a Vercel AI SDK language model for supported providers.
 * Failures are returned on the Effect error channel (no synchronous throw for expected cases).
 */
export const createProviderModel = (
  provider: string,
  model: string,
): Effect.Effect<ProviderModel, AICredentialError> => {
  switch (provider) {
    case "anthropic":
      return Effect.map(getProviderApiKey(provider), (apiKey) => createAnthropic({ apiKey })(model))
    case "openai":
      return Effect.map(getProviderApiKey(provider), (apiKey) => createOpenAI({ apiKey })(model))
    default:
      return Effect.fail(
        new AICredentialError({
          provider,
          message: `Unsupported AI provider "${provider}".`,
          statusCode: 400,
        }),
      )
  }
}

/**
 * Vercel AI SDK adapter providing only the `generate` capability.
 */
export const AIGenerateLive = Layer.succeed(AIGenerate, {
  generate: <T>(input: GenerateInput<T>): Effect.Effect<GenerateResult<T>, AIError | AICredentialError> =>
    Effect.gen(function* () {
      const providerModel = yield* createProviderModel(input.provider, input.model)

      return yield* Effect.tryPromise({
        try: async () => {
          const startTime = performance.now()

          const call: GenerateTextCall = {
            model: providerModel,
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
} satisfies AIGenerateShape)
