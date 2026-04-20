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
const MAX_ERROR_TEXT_LENGTH = 500
const bedrockScopedModelIdPattern = /^(?:(?:eu|us|apac)\.)?([a-z0-9-]+\..+)$/

/**
 * Bedrock vendor families that ship with cross-region inference (CRI)
 * profiles — only these get rewritten to `us.*` / `eu.*` / `apac.*` by the
 * resolver. Every other vendor's model ID passes through unchanged, because
 * prepending a geography prefix to a foundation-only model (e.g. MiniMax)
 * produces an identifier AWS rejects with "The provided model identifier
 * is invalid."
 *
 * Each entry matches on the vendor segment (everything before the first `.`
 * in the geography-less model ID). Add new vendor slugs here as AWS expands
 * CRI coverage.
 */
const BEDROCK_VENDORS_WITH_CROSS_REGION_INFERENCE = new Set<string>(["amazon", "anthropic", "meta"])

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
 * Keep `global.*` IDs intact, rewrite IDs from CRI-enabled vendors to the
 * current AWS geography, and pass every other vendor's model ID through raw
 * (foundation-only models break when wrapped with a geography prefix).
 */
const resolveBedrockModelId = (model: string, region: string): string => {
  if (model.startsWith("global.")) {
    return model
  }

  const match = model.match(bedrockScopedModelIdPattern)
  if (!match) {
    return model
  }

  // `match[1]` is the geography-less ID (e.g. `anthropic.claude-sonnet-4-…`
  // or `minimax.minimax-m2.5`), so its first dot-segment is the vendor
  // family. Only CRI-enabled vendors get the geography prefix; everyone
  // else passes through raw. This also strips a bogus `us.` / `eu.` /
  // `apac.` prefix supplied by a caller for a non-CRI vendor.
  const vendor = match[1].split(".")[0] ?? ""
  if (!BEDROCK_VENDORS_WITH_CROSS_REGION_INFERENCE.has(vendor)) {
    return match[1]
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

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

const truncateErrorText = (value: string): string =>
  value.length <= MAX_ERROR_TEXT_LENGTH ? value : `${value.slice(0, MAX_ERROR_TEXT_LENGTH)}...`

const formatErrorCause = (cause: unknown): string | undefined => {
  if (cause instanceof Error) {
    const message = cause.message.trim()
    return message === "" ? undefined : message
  }

  if (typeof cause === "string") {
    const message = cause.trim()
    return message === "" ? undefined : message
  }

  return undefined
}

const formatGenerateError = (error: unknown): string => {
  const baseMessage = error instanceof Error ? error.message : String(error)

  if (!isRecord(error)) {
    return baseMessage
  }

  const details: string[] = []
  const finishReason = typeof error.finishReason === "string" ? error.finishReason.trim() : ""
  if (finishReason !== "") {
    details.push(`finishReason=${finishReason}`)
  }

  const text = typeof error.text === "string" ? error.text.trim() : ""
  if (text !== "") {
    details.push(`text=${JSON.stringify(truncateErrorText(text))}`)
  }

  const causeMessage = formatErrorCause(error.cause)
  if (causeMessage !== undefined && causeMessage !== baseMessage) {
    details.push(`cause=${JSON.stringify(causeMessage)}`)
  }

  return details.length === 0 ? baseMessage : `${baseMessage} (${details.join(", ")})`
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
                message: `AI generation failed (${input.provider}/${input.model}): ${formatGenerateError(error)}`,
                cause: error,
              }),
          })
        }),
    } satisfies AIGenerateShape
  }),
)
