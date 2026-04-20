import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock"
import { fromNodeProviderChain } from "@aws-sdk/credential-providers"
import {
  AICredentialError,
  AIError,
  AIGenerate,
  type AIGenerateShape,
  type GenerateInput,
  type GenerateResult,
} from "@domain/ai"
import { getLatitudeTracer, runWithAiTelemetry } from "@platform/ai-latitude"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { generateText, Output } from "ai"
import { Effect, Layer } from "effect"

const latitudeTracer = getLatitudeTracer("vercelai")

type GenerateTextCall = Parameters<typeof generateText>[0]
type ProviderOptions = NonNullable<GenerateTextCall["providerOptions"]>
type ProviderModel = GenerateTextCall["model"]
type BedrockGeographyPrefix = "eu" | "us" | "apac"

const DEFAULT_MAX_OUTPUT_TOKENS = 8192
const bedrockScopedModelIdPattern = /^(?:(?:eu|us|apac)\.)?([a-z0-9-]+\..+)$/

const bedrockGeographyPrefixForAwsRegion = (region: string): BedrockGeographyPrefix => {
  if (region.startsWith("eu-")) {
    return "eu"
  }
  if (region.startsWith("us-") || region.startsWith("ca-") || region.startsWith("sa-") || region.startsWith("mx-")) {
    return "us"
  }
  if (region.startsWith("ap-") || region.startsWith("me-") || region.startsWith("af-")) {
    return "apac"
  }
  if (region.startsWith("il-")) {
    return "eu"
  }
  return "eu"
}

/**
 * Bedrock cross-region inference profiles are geography-scoped (`eu.*`, `us.*`, `apac.*`).
 * Keep `global.*` IDs intact and rewrite foundation model IDs to the current AWS geography.
 */
const resolveBedrockModelId = (model: string, region: string): string => {
  if (model.startsWith("global.")) {
    return model
  }

  const match = model.match(bedrockScopedModelIdPattern)
  if (!match) {
    return model
  }

  return `${bedrockGeographyPrefixForAwsRegion(region)}.${match[1]}`
}

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
    provider: "amazon-bedrock",
    message,
  })

const createBedrockProvider = (): Effect.Effect<
  { bedrock: ReturnType<typeof createAmazonBedrock>; region: string },
  AICredentialError
> =>
  Effect.gen(function* () {
    const region = yield* parseEnv("LAT_AWS_REGION", "string", "eu-central-1").pipe(
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
    const shouldUseCredentialProviderChain =
      apiKey === undefined && accessKeyId === undefined && secretAccessKey === undefined && sessionToken === undefined

    const bedrock = createAmazonBedrock({
      region,
      ...(apiKey !== undefined ? { apiKey } : {}),
      ...(accessKeyId !== undefined && secretAccessKey !== undefined
        ? {
            accessKeyId,
            secretAccessKey,
            ...(sessionToken !== undefined ? { sessionToken } : {}),
          }
        : {}),
      ...(shouldUseCredentialProviderChain
        ? {
            credentialProvider: fromNodeProviderChain(),
          }
        : {}),
    })

    return { bedrock, region }
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
    case "amazon-bedrock":
      return createBedrockProvider().pipe(
        Effect.map(({ bedrock, region }) => bedrock(resolveBedrockModelId(model, region))),
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
                  experimental_telemetry: {
                    isEnabled: true,
                    tracer: latitudeTracer,
                  },
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
