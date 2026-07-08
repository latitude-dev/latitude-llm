import { type InvalidEnvValueError, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"
import { AIError } from "./errors.ts"

// ---------------------------------------------------------------------------
// AI model configuration (LAT_AI_* environment overrides)
//
// Every internal AI capability resolves its provider/model/settings here.
// Generation resolves per feature with a global fallback tier:
//   LAT_AI_<FEATURE>_<SETTING> → LAT_AI_GENERATION_<SETTING> → hardcoded default.
// Embeddings and reranking are global-only:
//   LAT_AI_EMBEDDING_{PROVIDER,MODEL} / LAT_AI_RERANKING_{PROVIDER,MODEL}.
// Unset vars leave behavior identical to the hardcoded defaults.
// ---------------------------------------------------------------------------

export const GENERATION_REASONING_LEVELS = [
  "none",
  "provider-default",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const

export type GenerationReasoning = (typeof GENERATION_REASONING_LEVELS)[number]

export const GENERATION_FEATURES = [
  "ISSUE_DETAILS_GENERATOR",
  "FLAGGER_CLASSIFIER",
  "FLAGGER_EXTRACTOR",
  "FLAGGER_ANNOTATOR",
  "ANNOTATION_ENRICHER",
  "EVALUATION_JUDGE",
  "SIGNAL_GENERATOR",
  "TAXONOMY_NAMING",
  "GEPA_PROPOSER",
  "COMMAND_PALETTE_AGENT",
] as const

export type GenerationFeature = (typeof GENERATION_FEATURES)[number]

export interface GenerationModelConfig {
  readonly provider: string
  readonly model: string
  readonly reasoning?: GenerationReasoning
  readonly temperature?: number
  readonly maxTokens?: number
}

export interface AIProviderModelConfig {
  readonly provider: string
  readonly model: string
}

/**
 * Embedding dimensionality is a deployment-wide invariant, never configurable:
 * pgvector columns and the ClickHouse message_embeddings table bake it into
 * migrations. Whatever embedding model is configured must emit vectors of
 * exactly this size.
 */
export const EMBEDDING_DIMENSIONS = 2048

export const DEFAULT_EMBEDDING_CONFIG: AIProviderModelConfig = {
  provider: "voyage",
  model: "voyage-4-large",
} as const

export const DEFAULT_RERANKING_CONFIG: AIProviderModelConfig = {
  provider: "voyage",
  model: "rerank-2.5",
} as const

const invalidEnv = (error: InvalidEnvValueError) => new AIError({ message: error.message, cause: error })

const resolveString = (
  feature: string,
  setting: string,
): Effect.Effect<{ name: string; value: string } | undefined, AIError> =>
  Effect.gen(function* () {
    for (const scope of [feature, "GENERATION"]) {
      const name = `LAT_AI_${scope}_${setting}`
      const value = yield* parseEnvOptional(name, "string").pipe(Effect.mapError(invalidEnv))
      if (value !== undefined) {
        return { name, value }
      }
    }
    return undefined
  })

const resolveNumber = (feature: string, setting: string): Effect.Effect<number | undefined, AIError> =>
  Effect.gen(function* () {
    for (const scope of [feature, "GENERATION"]) {
      const value = yield* parseEnvOptional(`LAT_AI_${scope}_${setting}`, "number").pipe(Effect.mapError(invalidEnv))
      if (value !== undefined) {
        return value
      }
    }
    return undefined
  })

const isGenerationReasoning = (value: string): value is GenerationReasoning =>
  (GENERATION_REASONING_LEVELS as readonly string[]).includes(value)

const resolveReasoning = (feature: string): Effect.Effect<GenerationReasoning | undefined, AIError> =>
  Effect.gen(function* () {
    const resolved = yield* resolveString(feature, "REASONING")
    if (resolved === undefined) {
      return undefined
    }
    if (!isGenerationReasoning(resolved.value)) {
      return yield* Effect.fail(
        new AIError({
          message: `Invalid environment variable: ${resolved.name}=${resolved.value} (expected one of ${GENERATION_REASONING_LEVELS.join(", ")})`,
        }),
      )
    }
    return resolved.value
  })

/**
 * Provider and model must be set together at the same tier — model ids are
 * provider-specific, so overriding only one of the pair at a given tier
 * almost certainly produces an id the other provider rejects. The resolver
 * stays per-setting (most-specific tier wins) and the pairing rule is a
 * documented operator contract, enforced per call by the provider itself.
 */
export const resolveGenerationConfig = (
  feature: GenerationFeature,
  defaults: GenerationModelConfig,
): Effect.Effect<GenerationModelConfig, AIError> =>
  Effect.gen(function* () {
    const provider = (yield* resolveString(feature, "PROVIDER"))?.value ?? defaults.provider
    const model = (yield* resolveString(feature, "MODEL"))?.value ?? defaults.model
    const reasoning = (yield* resolveReasoning(feature)) ?? defaults.reasoning
    const temperature = (yield* resolveNumber(feature, "TEMPERATURE")) ?? defaults.temperature
    const maxTokens = (yield* resolveNumber(feature, "MAX_TOKENS")) ?? defaults.maxTokens

    return {
      provider,
      model,
      ...(reasoning !== undefined ? { reasoning } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(maxTokens !== undefined ? { maxTokens } : {}),
    } satisfies GenerationModelConfig
  })

const resolveProviderModel = (
  scope: "EMBEDDING" | "RERANKING",
  defaults: AIProviderModelConfig,
): Effect.Effect<AIProviderModelConfig, AIError> =>
  Effect.gen(function* () {
    const provider = yield* parseEnvOptional(`LAT_AI_${scope}_PROVIDER`, "string").pipe(Effect.mapError(invalidEnv))
    const model = yield* parseEnvOptional(`LAT_AI_${scope}_MODEL`, "string").pipe(Effect.mapError(invalidEnv))

    return {
      provider: provider ?? defaults.provider,
      model: model ?? defaults.model,
    } satisfies AIProviderModelConfig
  })

export const resolveEmbeddingConfig = (): Effect.Effect<AIProviderModelConfig, AIError> =>
  resolveProviderModel("EMBEDDING", DEFAULT_EMBEDDING_CONFIG)

export const resolveRerankingConfig = (): Effect.Effect<AIProviderModelConfig, AIError> =>
  resolveProviderModel("RERANKING", DEFAULT_RERANKING_CONFIG)
