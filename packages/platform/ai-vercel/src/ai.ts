import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock"
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
import { parseEnv, parseEnvOptional } from "@platform/env"
import { generateText, Output } from "ai"
import { Effect, Layer } from "effect"

type GenerateTextCall = Parameters<typeof generateText>[0]
type ProviderOptions = NonNullable<GenerateTextCall["providerOptions"]>
type ProviderModel = GenerateTextCall["model"]

const DEFAULT_MAX_OUTPUT_TOKENS = 8192
const BEDROCK_PROVIDER = "amazon-bedrock"

const isSupportedBedrockProvider = (provider: string) => provider === BEDROCK_PROVIDER

const normalizeProviderOptions = (
  providerOptions: GenerateInput<unknown>["providerOptions"],
): ProviderOptions | undefined => {
  if (providerOptions === undefined) {
    return undefined
  }

  return providerOptions as ProviderOptions
}

const mapCredentialError = (message: string) =>
  new AICredentialError({
    provider: BEDROCK_PROVIDER,
    message,
  })

const getRequiredApiKey = (
  provider: "anthropic" | "openai",
  envVar: string,
): Effect.Effect<string, AICredentialError> =>
  parseEnvOptional(envVar, "string").pipe(
    Effect.mapError(
      () =>
        new AICredentialError({
          provider,
          message: `${provider === "anthropic" ? "Anthropic" : "OpenAI"} credentials are invalid: ${envVar} must be a string.`,
        }),
    ),
    Effect.flatMap((apiKey) => {
      if (apiKey !== undefined) {
        return Effect.succeed(apiKey)
      }

      return Effect.fail(
        new AICredentialError({
          provider,
          message: `${provider === "anthropic" ? "Anthropic" : "OpenAI"} is unavailable: set ${envVar}.`,
        }),
      )
    }),
  )

const createBedrockProvider = (): Effect.Effect<ReturnType<typeof createAmazonBedrock>, AICredentialError> =>
  Effect.gen(function* () {
    const region = yield* parseEnv("LAT_AWS_REGION", "string", "us-east-1").pipe(
      Effect.mapError(() => mapCredentialError("Amazon Bedrock is unavailable: set LAT_AWS_REGION.")),
    )
    const accessKeyId = yield* parseEnvOptional("LAT_AWS_ACCESS_KEY_ID", "string").pipe(
      Effect.mapError(() =>
        mapCredentialError("Amazon Bedrock credentials are invalid: LAT_AWS_ACCESS_KEY_ID must be a string."),
      ),
    )
    const secretAccessKey = yield* parseEnvOptional("LAT_AWS_SECRET_ACCESS_KEY", "string").pipe(
      Effect.mapError(() =>
        mapCredentialError("Amazon Bedrock credentials are invalid: LAT_AWS_SECRET_ACCESS_KEY must be a string."),
      ),
    )
    const sessionToken = yield* parseEnvOptional("LAT_AWS_SESSION_TOKEN", "string").pipe(
      Effect.mapError(() =>
        mapCredentialError("Amazon Bedrock credentials are invalid: LAT_AWS_SESSION_TOKEN must be a string."),
      ),
    )
    const apiKey = yield* parseEnvOptional("LAT_AWS_BEARER_TOKEN_BEDROCK", "string").pipe(
      Effect.mapError(() =>
        mapCredentialError("Amazon Bedrock credentials are invalid: LAT_AWS_BEARER_TOKEN_BEDROCK must be a string."),
      ),
    )

    return createAmazonBedrock({
      region,
      ...(apiKey !== undefined ? { apiKey } : {}),
      ...(accessKeyId !== undefined && secretAccessKey !== undefined
        ? {
            accessKeyId,
            secretAccessKey,
            ...(sessionToken !== undefined ? { sessionToken } : {}),
          }
        : {}),
    })
  })

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
      if (isSupportedBedrockProvider(provider)) {
        return createBedrockProvider().pipe(Effect.map((bedrock) => bedrock(model)))
      }

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
                const providerOptions = normalizeProviderOptions(input.providerOptions)

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
                  ...(providerOptions !== undefined ? { providerOptions } : {}),
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
