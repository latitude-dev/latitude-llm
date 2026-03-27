import { createAnthropic } from "@ai-sdk/anthropic"
import { AI, AICredentials, AIError, type GenerateTextInput } from "@domain/ai"
import { generateText } from "ai"
import { Effect, Layer } from "effect"

/**
 * Creates a Vercel AI SDK provider instance for the given provider name.
 * Extend this map as new providers are needed.
 */
const createProviderModel = (provider: string, model: string, apiKey: string) => {
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(model)
    default:
      throw new Error(`Unsupported AI provider: ${provider}`)
  }
}

/**
 * Generic AI adapter backed by the Vercel AI SDK.
 *
 * Resolves credentials through the AICredentials service at call time.
 * The caller (domain use-case) specifies provider, model, and prompt.
 * This package knows nothing about annotations, enrichment, or any domain concept.
 */
export const AILive = Layer.effect(
  AI,
  Effect.gen(function* () {
    const credentials = yield* AICredentials

    return {
      generateText: (input: GenerateTextInput) =>
        Effect.gen(function* () {
          const apiKey = yield* credentials.getApiKey(input.provider)

          return yield* Effect.tryPromise({
            try: async () => {
              const startTime = performance.now()

              const result = await generateText({
                model: createProviderModel(input.provider, input.model, apiKey),
                system: input.system,
                prompt: input.prompt,
                maxOutputTokens: input.maxTokens ?? 256,
                temperature: input.temperature ?? 0.3,
              })

              const durationNs = Math.round((performance.now() - startTime) * 1_000_000)

              return {
                text: result.text.trim(),
                tokens: result.usage?.totalTokens ?? 0,
                duration: durationNs,
              }
            },
            catch: (error) =>
              new AIError({
                message: `AI text generation failed (${input.provider}/${input.model}): ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
              }),
          })
        }),
    }
  }),
)
