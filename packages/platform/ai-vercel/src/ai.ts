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
import { runWithAiTelemetry } from "@platform/ai-latitude"
import { generateText, Output } from "ai"
import { Effect, Layer } from "effect"

type GenerateTextCall = Parameters<typeof generateText>[0]
type ProviderOptions = NonNullable<GenerateTextCall["providerOptions"]>
type ProviderModel = GenerateTextCall["model"]

const DEFAULT_MAX_OUTPUT_TOKENS = 8192

const getRequiredApiKey = (provider: string, envVar: string): Effect.Effect<string, AICredentialError> => {
  const apiKey = process.env[envVar]

  if (apiKey && apiKey.length > 0) {
    return Effect.succeed(apiKey)
  }

  return Effect.fail(
    new AICredentialError({
      provider,
      message: `${provider === "anthropic" ? "Anthropic" : "OpenAI"} is unavailable: set ${envVar}.`,
    }),
  )
}

/**
 * Creates a Vercel AI SDK language model for supported providers.
 * Failures are returned on the Effect error channel.
 */
export const createProviderModel = (
  provider: string,
  model: string,
): Effect.Effect<ProviderModel, AICredentialError> => {
  switch (provider) {
    case "anthropic":
      return getRequiredApiKey(provider, "LAT_ANTHROPIC_API_KEY").pipe(
        Effect.map((apiKey) => createAnthropic({ apiKey })(model)),
      )
    case "openai":
      return getRequiredApiKey(provider, "LAT_OPENAI_API_KEY").pipe(
        Effect.map((apiKey) => createOpenAI({ apiKey })(model)),
      )
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

export const AIGenerateLive = Layer.effect(
  AIGenerate,
  Effect.gen(function* () {
    return {
      generate: <T>(input: GenerateInput<T>): Effect.Effect<GenerateResult<T>, AIError | AICredentialError> =>
        Effect.gen(function* () {
          const providerModel = yield* createProviderModel(input.provider, input.model)

          return yield* Effect.tryPromise({
            try: async () => {
              const execute = async () => {
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
                  ...(input.providerOptions !== undefined
                    ? { providerOptions: input.providerOptions as ProviderOptions }
                    : {}),
                }

                const result = await generateText(call)

                return {
                  object: result.output,
                  tokens: result.usage?.totalTokens ?? 0,
                  duration: Math.round((performance.now() - startTime) * 1_000_000),
                } satisfies GenerateResult<T>
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
    } satisfies AIGenerateShape
  }),
)
