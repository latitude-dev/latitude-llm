import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { AI, AICredentials, AIError, type GenerateObjectInput } from "@domain/ai"
import { isLatitudeAiProvider, LATITUDE_AI_PROVIDERS } from "@platform/ai-credentials"
import { generateText, Output } from "ai"
import { Effect, Layer } from "effect"

type GenerateTextCall = Parameters<typeof generateText>[0]

/**
 * Creates a Vercel AI SDK language model for supported providers.
 */
const createProviderModel = (provider: string, model: string, apiKey: string) => {
  if (!isLatitudeAiProvider(provider)) {
    throw new Error(`Unsupported AI provider: ${provider}`)
  }
  switch (provider) {
    case LATITUDE_AI_PROVIDERS.anthropic:
      return createAnthropic({ apiKey })(model)
    case LATITUDE_AI_PROVIDERS.openai:
      return createOpenAI({ apiKey })(model)
  }
}

/**
 * Generic AI adapter backed by the Vercel AI SDK.
 *
 * Resolves credentials through the AICredentials service at call time.
 * The caller (domain use-case) specifies provider, model, prompt, and Zod schema.
 * This package knows nothing about annotations, enrichment, or any domain concept.
 */
export const AILive = Layer.effect(
  AI,
  Effect.gen(function* () {
    const credentials = yield* AICredentials

    return {
      generateObject: <T>(input: GenerateObjectInput<T>) =>
        Effect.gen(function* () {
          const apiKey = yield* credentials.getApiKey(input.provider)

          return yield* Effect.tryPromise({
            try: async () => {
              const startTime = performance.now()

              const call: GenerateTextCall = {
                model: createProviderModel(input.provider, input.model, apiKey),
                system: input.system,
                prompt: input.prompt,
                output: Output.object({ schema: input.schema }),
                maxOutputTokens: input.maxTokens ?? 256,
                temperature: input.temperature ?? 0.3,
                ...(input.topP !== undefined ? { topP: input.topP } : {}),
                ...(input.topK !== undefined ? { topK: input.topK } : {}),
                ...(input.presencePenalty !== undefined ? { presencePenalty: input.presencePenalty } : {}),
                ...(input.frequencyPenalty !== undefined ? { frequencyPenalty: input.frequencyPenalty } : {}),
                ...(input.stopSequences !== undefined ? { stopSequences: [...input.stopSequences] } : {}),
                ...(input.seed !== undefined ? { seed: input.seed } : {}),
                ...(input.reasoning !== undefined
                  ? { reasoning: input.reasoning as GenerateTextCall["reasoning"] }
                  : {}),
                ...(input.providerOptions !== undefined
                  ? {
                      providerOptions: input.providerOptions as NonNullable<GenerateTextCall["providerOptions"]>,
                    }
                  : {}),
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
                message: `AI object generation failed (${input.provider}/${input.model}): ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
              }),
          })
        }),
    }
  }),
)
