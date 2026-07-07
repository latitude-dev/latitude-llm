import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogle } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { fromNodeProviderChain } from "@aws-sdk/credential-providers"
import {
  AIAgent,
  type AIAgentShape,
  AICredentialError,
  AIError,
  AIGenerate,
  type AIGenerateShape,
  type AgentStep,
  type AgentToolDef,
  EMBEDDING_DIMENSIONS,
  type EmbedInput,
  type EmbedResult,
  type GenerateInput,
  type GenerateResult,
  type RerankInput,
  type RerankResult,
  type RunAgentInput,
  type RunAgentResult,
} from "@domain/ai"
import { getLatitudeTracer, runWithAiTelemetry } from "@platform/ai-latitude"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { embed, generateText, jsonSchema, Output, rerank, stepCountIs, tool, type ToolSet } from "ai"
import { Effect, Layer } from "effect"
import { z } from "zod"

const latitudeTracer = getLatitudeTracer("vercelai")

type GenerateTextCall = Parameters<typeof generateText>[0]
type ProviderOptions = NonNullable<GenerateTextCall["providerOptions"]>
type ProviderModel = GenerateTextCall["model"]
type BedrockGeographyPrefix = "eu" | "us" | "apac"

const DEFAULT_MAX_OUTPUT_TOKENS = 8192
const MAX_ERROR_TEXT_LENGTH = 4_000

export const SUPPORTED_GENERATION_PROVIDERS = ["amazon-bedrock", "anthropic", "openai", "google", "custom"] as const

/** providerOptions key for the OpenAI-compatible provider (its `name` setting). */
const CUSTOM_PROVIDER_OPTIONS_KEY = "custom"
const BEDROCK_MINIMAX_M25_MODEL_ID = "minimax.minimax-m2.5"
const BEDROCK_MINIMAX_M25_FALLBACK_MODEL = {
  provider: "amazon-bedrock",
  model: "openai.gpt-oss-120b-1:0",
} as const
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

const stripBedrockGeographyPrefix = (model: string): string => {
  if (model.startsWith("global.")) {
    return model
  }

  return model.match(bedrockScopedModelIdPattern)?.[1] ?? model
}

const resolveGenerateFallback = (
  input: GenerateInput<unknown>,
): { readonly provider: string; readonly model: string } | undefined => {
  if (input.provider !== "amazon-bedrock") {
    return undefined
  }

  if (stripBedrockGeographyPrefix(input.model) !== BEDROCK_MINIMAX_M25_MODEL_ID) {
    return undefined
  }

  return BEDROCK_MINIMAX_M25_FALLBACK_MODEL
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

const createAnthropicProvider = (): Effect.Effect<ReturnType<typeof createAnthropic>, AICredentialError> =>
  Effect.gen(function* () {
    const apiKey = yield* parseEnv("LAT_ANTHROPIC_API_KEY", "string").pipe(
      Effect.mapError(
        () =>
          new AICredentialError({
            provider: "anthropic",
            message: "Anthropic is unavailable: set LAT_ANTHROPIC_API_KEY.",
          }),
      ),
    )
    return createAnthropic({ apiKey })
  })

const createOpenAIProvider = (): Effect.Effect<ReturnType<typeof createOpenAI>, AICredentialError> =>
  Effect.gen(function* () {
    const apiKey = yield* parseEnv("LAT_OPENAI_API_KEY", "string").pipe(
      Effect.mapError(
        () =>
          new AICredentialError({
            provider: "openai",
            message: "OpenAI is unavailable: set LAT_OPENAI_API_KEY.",
          }),
      ),
    )
    return createOpenAI({ apiKey })
  })

const createGoogleProvider = (): Effect.Effect<ReturnType<typeof createGoogle>, AICredentialError> =>
  Effect.gen(function* () {
    const apiKey = yield* parseEnv("LAT_GOOGLE_API_KEY", "string").pipe(
      Effect.mapError(
        () =>
          new AICredentialError({
            provider: "google",
            message: "Google is unavailable: set LAT_GOOGLE_API_KEY.",
          }),
      ),
    )
    return createGoogle({ apiKey })
  })

/**
 * The `custom` provider is any OpenAI-compatible endpoint (Ollama, vLLM,
 * LM Studio, gateways): `LAT_CUSTOM_AI_BASE_URL` is required, the API key is
 * optional because local servers are often unauthenticated.
 */
const createCustomProvider = (): Effect.Effect<ReturnType<typeof createOpenAICompatible>, AICredentialError> =>
  Effect.gen(function* () {
    const baseURL = yield* parseEnv("LAT_CUSTOM_AI_BASE_URL", "string").pipe(
      Effect.mapError(
        () =>
          new AICredentialError({
            provider: "custom",
            message: "The custom AI provider is unavailable: set LAT_CUSTOM_AI_BASE_URL.",
          }),
      ),
    )
    const apiKey = yield* parseEnvOptional("LAT_CUSTOM_AI_API_KEY", "string").pipe(
      Effect.mapError(
        () =>
          new AICredentialError({
            provider: "custom",
            message: "The custom AI provider credentials are invalid: LAT_CUSTOM_AI_API_KEY must be a string.",
          }),
      ),
    )

    return createOpenAICompatible({
      name: CUSTOM_PROVIDER_OPTIONS_KEY,
      baseURL,
      ...(apiKey !== undefined ? { apiKey } : {}),
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
    case "amazon-bedrock":
      return createBedrockProvider().pipe(
        Effect.map(({ bedrock, region }) => bedrock(resolveBedrockModelId(model, region))),
      )

    case "anthropic":
      return createAnthropicProvider().pipe(Effect.map((anthropic) => anthropic(model)))

    case "openai":
      return createOpenAIProvider().pipe(Effect.map((openai) => openai(model)))

    case "google":
      return createGoogleProvider().pipe(Effect.map((google) => google(model)))

    case "custom":
      return createCustomProvider().pipe(Effect.map((custom) => custom(model)))

    default:
      return Effect.fail(
        new AICredentialError({
          provider,
          message: `Unsupported AI provider "${provider}". Supported providers: ${SUPPORTED_GENERATION_PROVIDERS.join(", ")}.`,
          statusCode: 400,
        }),
      )
  }
}

export const AIGenerateLive = Layer.effect(
  AIGenerate,
  Effect.gen(function* () {
    const generate = Effect.fn("ai.generate")(function* <T>(input: GenerateInput<T>) {
      yield* Effect.annotateCurrentSpan("effect.ai.provider", input.provider)
      yield* Effect.annotateCurrentSpan("effect.ai.model", input.model)
      if (input.telemetry?.spanName !== undefined) {
        yield* Effect.annotateCurrentSpan("effect.ai.telemetry_span_name", input.telemetry.spanName)
      }

      const providerModel = yield* createProviderModel(input.provider, input.model)
      const fallback = resolveGenerateFallback(input)
      const fallbackProviderModel = fallback ? yield* createProviderModel(fallback.provider, fallback.model) : undefined

      return yield* Effect.tryPromise({
        try: async () => {
          const generateWithModel = async (model: ProviderModel) => {
            const startTime = performance.now()
            const providerOptions = normalizeProviderOptions(input.providerOptions)

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
              ...(providerOptions !== undefined ? { providerOptions } : {}),
              experimental_telemetry: {
                isEnabled: true,
                tracer: latitudeTracer,
              },
            }

            const result = await generateText(call)
            const usage = result.usage

            return {
              object: result.output,
              tokens: usage?.totalTokens ?? 0,
              tokenUsage: {
                input: usage?.inputTokens ?? 0,
                output: usage?.outputTokens ?? 0,
                ...(usage?.reasoningTokens !== undefined ? { reasoning: usage.reasoningTokens } : {}),
                ...(usage?.cachedInputTokens !== undefined ? { cacheRead: usage.cachedInputTokens } : {}),
              },
              duration: Math.round((performance.now() - startTime) * 1_000_000),
            } satisfies GenerateResult<T>
          }

          const execute = async () => {
            try {
              return await generateWithModel(providerModel)
            } catch (primaryError) {
              if (!fallback || fallbackProviderModel === undefined) {
                throw primaryError
              }

              try {
                return await generateWithModel(fallbackProviderModel)
              } catch (fallbackError) {
                throw new Error(
                  `Primary model ${input.provider}/${input.model} failed: ${formatGenerateError(primaryError)}; ` +
                    `fallback model ${fallback.provider}/${fallback.model} failed: ${formatGenerateError(fallbackError)}`,
                )
              }
            }
          }

          return await runWithAiTelemetry(input.telemetry, execute)
        },
        catch: (error) =>
          new AIError({
            message: `AI generation failed (${input.provider}/${input.model}): ${formatGenerateError(error)}`,
            cause: error,
          }),
      })
    })

    return {
      generate,
    } satisfies AIGenerateShape
  }),
)

// ---------------------------------------------------------------------------
// Agent loop (native tool-calling)
// ---------------------------------------------------------------------------

// JSON-schema keywords Bedrock's tool-use converter rejects. Zod emits these
// from `.int()`/`.min()`/`.max()`/array bounds, so a schema that round-trips
// fine everywhere else breaks Bedrock. See memory
// `bedrock-structured-output-schema-subset`.
const BEDROCK_UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
])

const stripBedrockUnsupportedKeywords = (node: unknown): unknown => {
  if (Array.isArray(node)) {
    return node.map(stripBedrockUnsupportedKeywords)
  }
  if (node !== null && typeof node === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node)) {
      if (BEDROCK_UNSUPPORTED_SCHEMA_KEYWORDS.has(key)) {
        continue
      }
      // Bedrock accepts `anyOf` but not `oneOf`; the two are interchangeable
      // for validation here because the host re-validates against the real schema.
      if (key === "oneOf") {
        out.anyOf = stripBedrockUnsupportedKeywords(value)
        continue
      }
      out[key] = stripBedrockUnsupportedKeywords(value)
    }
    return out
  }
  return node
}

/**
 * Converts a model-facing tool schema to a Bedrock-safe JSON schema, stripping
 * the constraint keywords Bedrock's tool-use converter rejects. Best-effort:
 * if the Zod → JSON-schema conversion throws, the raw Zod schema is returned so
 * the SDK's own conversion still runs (no worse than not loosening). Safe
 * because every caller re-validates the tool input against the real schema.
 */
export const loosenSchemaForBedrock = (schema: z.ZodType): z.ZodType | ReturnType<typeof jsonSchema> => {
  try {
    const json = z.toJSONSchema(schema, { target: "draft-2020-12", reused: "inline" })
    return jsonSchema(stripBedrockUnsupportedKeywords(json) as Parameters<typeof jsonSchema>[0])
  } catch {
    return schema
  }
}

const buildAgentTools = (defs: ReadonlyArray<AgentToolDef>, provider: string): ToolSet =>
  Object.fromEntries(
    defs.map((def) => [
      def.name,
      tool({
        description: def.description,
        inputSchema: provider === "amazon-bedrock" ? loosenSchemaForBedrock(def.inputSchema) : def.inputSchema,
        execute: (args: unknown) => def.execute(args),
      }),
    ]),
  )

type AgentStepResult = Parameters<NonNullable<Parameters<typeof generateText>[0]["onStepFinish"]>>[0]

const toAgentStep = (step: AgentStepResult): AgentStep => {
  const text = step.text.trim()
  return {
    ...(text === "" ? {} : { text }),
    toolCalls: step.toolCalls.map((call) => ({ name: call.toolName, input: call.input })),
    finishReason: step.finishReason,
    tokenUsage: { input: step.usage?.inputTokens ?? 0, output: step.usage?.outputTokens ?? 0 },
  }
}

export const AIAgentLive = Layer.effect(
  AIAgent,
  Effect.gen(function* () {
    const runAgent = Effect.fn("ai.runAgent")(function* (input: RunAgentInput) {
      yield* Effect.annotateCurrentSpan("effect.ai.provider", input.provider)
      yield* Effect.annotateCurrentSpan("effect.ai.model", input.model)
      if (input.telemetry?.spanName !== undefined) {
        yield* Effect.annotateCurrentSpan("effect.ai.telemetry_span_name", input.telemetry.spanName)
      }

      const providerModel = yield* createProviderModel(input.provider, input.model)

      return yield* Effect.tryPromise({
        try: () =>
          runWithAiTelemetry(input.telemetry, async () => {
            const steps: AgentStep[] = []
            const result = await generateText({
              model: providerModel,
              system: input.system,
              prompt: input.prompt,
              tools: buildAgentTools(input.tools, input.provider),
              stopWhen: stepCountIs(input.maxSteps),
              reasoning: input.reasoning ?? "provider-default",
              maxOutputTokens: input.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
              ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
              ...(input.abortSignal !== undefined ? { abortSignal: input.abortSignal } : {}),
              onStepFinish: (step) => {
                const agentStep = toAgentStep(step)
                steps.push(agentStep)
                input.onStep?.(agentStep)
              },
              experimental_telemetry: {
                isEnabled: true,
                tracer: latitudeTracer,
              },
            })

            return {
              text: result.text,
              steps,
              tokenUsage: {
                input: result.totalUsage?.inputTokens ?? 0,
                output: result.totalUsage?.outputTokens ?? 0,
              },
              finishReason: result.finishReason,
            } satisfies RunAgentResult
          }),
        catch: (error) =>
          new AIError({
            message: `AI agent run failed (${input.provider}/${input.model}): ${formatGenerateError(error)}`,
            cause: error,
          }),
      })
    })

    return {
      runAgent,
    } satisfies AIAgentShape
  }),
)

type EmbedCall = Parameters<typeof embed>[0]
type EmbeddingModel = EmbedCall["model"]
type EmbedProviderOptions = NonNullable<EmbedCall["providerOptions"]>
type RerankingModel = Parameters<typeof rerank>[0]["model"]

export const SUPPORTED_EMBEDDING_PROVIDERS = ["voyage", "openai", "google", "custom"] as const

export const SUPPORTED_RERANKING_PROVIDERS = ["voyage", "amazon-bedrock"] as const

const credentialToAIError = Effect.mapError(
  (error: { readonly message: string }) => new AIError({ message: error.message, cause: error }),
)

/**
 * Google task types mirror Voyage's document/query asymmetry; the other
 * providers have no input-type concept and embed symmetrically.
 */
const googleTaskType = (inputType: EmbedInput["inputType"]) =>
  inputType === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT"

const createEmbeddingCall = (
  input: EmbedInput,
): Effect.Effect<{ model: EmbeddingModel; providerOptions: EmbedProviderOptions }, AIError> => {
  switch (input.provider) {
    case "openai":
      return createOpenAIProvider().pipe(
        credentialToAIError,
        Effect.map((openai) => ({
          model: openai.embeddingModel(input.model),
          providerOptions: { openai: { dimensions: EMBEDDING_DIMENSIONS } },
        })),
      )

    case "google":
      return createGoogleProvider().pipe(
        credentialToAIError,
        Effect.map((google) => ({
          model: google.embeddingModel(input.model),
          providerOptions: {
            google: {
              outputDimensionality: EMBEDDING_DIMENSIONS,
              taskType: googleTaskType(input.inputType),
            },
          },
        })),
      )

    case "custom":
      return createCustomProvider().pipe(
        credentialToAIError,
        Effect.map((custom) => ({
          model: custom.embeddingModel(input.model),
          providerOptions: { [CUSTOM_PROVIDER_OPTIONS_KEY]: { dimensions: EMBEDDING_DIMENSIONS } },
        })),
      )

    default:
      return Effect.fail(
        new AIError({
          message: `Unsupported embedding provider "${input.provider}". Supported providers: ${SUPPORTED_EMBEDDING_PROVIDERS.join(", ")}.`,
        }),
      )
  }
}

/**
 * Several providers return unnormalized vectors when truncating to a
 * non-native dimension (e.g. Google with `outputDimensionality`), while the
 * centroid/clustering math assumes unit vectors. Normalizing an already-unit
 * vector is a no-op, so always normalize.
 */
const normalizeL2 = (vector: readonly number[]): number[] => {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (norm === 0 || !Number.isFinite(norm)) {
    return [...vector]
  }
  return vector.map((value) => value / norm)
}

export const embedWithVercel = (input: EmbedInput): Effect.Effect<EmbedResult, AIError> =>
  Effect.gen(function* () {
    const { model, providerOptions } = yield* createEmbeddingCall(input)

    const embedding = yield* Effect.tryPromise({
      try: () =>
        runWithAiTelemetry(input.telemetry, async () => {
          const result = await embed({
            model,
            value: input.text,
            providerOptions,
          })
          return result.embedding
        }),
      catch: (cause) =>
        new AIError({
          message: `Embedding failed (${input.provider}/${input.model}): ${cause instanceof Error ? cause.message : String(cause)}`,
          cause,
        }),
    })

    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      return yield* Effect.fail(
        new AIError({
          message:
            `Embedding model "${input.model}" (${input.provider}) returned ${embedding.length}-dimensional vectors; ` +
            `Latitude requires exactly ${EMBEDDING_DIMENSIONS}. Configure a model that supports ${EMBEDDING_DIMENSIONS} output dimensions.`,
        }),
      )
    }

    return { embedding: normalizeL2(embedding) } satisfies EmbedResult
  })

const createRerankingModel = (input: RerankInput): Effect.Effect<RerankingModel, AIError> => {
  switch (input.provider) {
    case "amazon-bedrock":
      // Rerank model ids (e.g. `cohere.rerank-v3-5:0`) have no cross-region
      // inference profiles — pass them through without geography rewriting.
      return createBedrockProvider().pipe(
        credentialToAIError,
        Effect.map(({ bedrock }) => bedrock.reranking(input.model)),
      )

    default:
      return Effect.fail(
        new AIError({
          message: `Unsupported reranking provider "${input.provider}". Supported providers: ${SUPPORTED_RERANKING_PROVIDERS.join(", ")}.`,
        }),
      )
  }
}

export const rerankWithVercel = (input: RerankInput): Effect.Effect<readonly RerankResult[], AIError> =>
  Effect.gen(function* () {
    const model = yield* createRerankingModel(input)

    return yield* Effect.tryPromise({
      try: () =>
        runWithAiTelemetry(input.telemetry, async () => {
          const result = await rerank({
            model,
            query: input.query,
            documents: [...input.documents],
          })

          return result.ranking.map(
            (entry): RerankResult => ({
              index: entry.originalIndex,
              relevanceScore: entry.score,
            }),
          )
        }),
      catch: (cause) =>
        new AIError({
          message: `Rerank failed (${input.provider}/${input.model}): ${cause instanceof Error ? cause.message : String(cause)}`,
          cause,
        }),
    })
  })
