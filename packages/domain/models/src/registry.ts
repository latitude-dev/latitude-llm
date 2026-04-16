/**
 * Model registry: query, look up, and estimate costs for LLM models.
 *
 * Uses the bundled models.dev JSON as the data source. All operations
 * are synchronous and require no network calls.
 */

import { formatCount, formatPrice } from "@repo/utils"
import modelsDevJson from "./data/models.dev.json" with { type: "json" }
import type { CostBreakdown, CostLookupResult, TokenUsage } from "./entities/cost.ts"
import { computeCostBreakdown, estimateTotalCost } from "./entities/cost.ts"
import type { Model, ModelPricing } from "./entities/model.ts"
import { parseModelsDevData } from "./entities/model.ts"

let cachedModels: Model[] | null = null

/**
 * Maps well-known provider identifiers to their models.dev equivalents.
 *
 * Providers whose internal names differ from the models.dev convention
 * are mapped here. Unknown providers pass through unchanged.
 */
const PROVIDER_ALIASES: Record<string, string> = {
  amazon_bedrock: "amazon-bedrock",
  google_vertex: "google-vertex",
  anthropic_vertex: "anthropic-vertex",
}

// Vercel AI SDK appends transport-style suffixes like `.responses` and `.chat`
// to provider ids. Strip them so pricing lookup resolves to the base provider.
const VERCEL_PROVIDER_SUFFIX = /\.(chat|messages|responses|generative-ai|embed)$/

function resolveProviderName(provider: string): string {
  const stripped = provider.replace(VERCEL_PROVIDER_SUFFIX, "")
  return PROVIDER_ALIASES[stripped] ?? stripped
}

/**
 * Bedrock regional inference profiles prepend a geography prefix
 * (`eu.`, `us.`, `apac.`) to the foundation model ID. Strip it
 * so cost lookups match the base model ID in models.dev.
 *
 * @example "eu.amazon.nova-micro-v1:0" → "amazon.nova-micro-v1:0"
 * @example "us.anthropic.claude-sonnet-4-6" → "anthropic.claude-sonnet-4-6"
 */
const BEDROCK_REGION_PREFIX_RE = /^(?:eu|us|apac)\./

function stripBedrockRegionPrefix(modelId: string): string {
  return modelId.replace(BEDROCK_REGION_PREFIX_RE, "")
}

/**
 * Return the full list of bundled LLM models from models.dev.
 *
 * The result is cached after the first call.
 */
export function getAllModels(): Model[] {
  if (!cachedModels) {
    cachedModels = parseModelsDevData(modelsDevJson)
  }
  return cachedModels
}

/**
 * Find a model by ID (case-insensitive) with prefix fallback.
 *
 * First tries an exact match; if none is found, falls back to the
 * model whose ID is the longest prefix of the requested `modelId`.
 * Useful for versioned model names like `gpt-4.1-2025-04-14` matching `gpt-4.1`.
 */
export function findModel(models: Model[], modelId: string): Model | undefined {
  const needle = modelId.toLowerCase()

  const exact = models.find((m) => m.id.toLowerCase() === needle)
  if (exact) return exact

  let best: Model | undefined
  let bestLen = 0

  for (const m of models) {
    const id = m.id.toLowerCase()
    if (needle.startsWith(id) && id.length > bestLen) {
      best = m
      bestLen = id.length
    }
  }

  return best
}

/**
 * Get the pricing for a model, or null if unavailable.
 */
export function getModelPricing(model: Model): ModelPricing | null {
  if (!model.pricing?.input || !model.pricing?.output) return null
  return model.pricing
}

/**
 * Get all models for a specific provider.
 *
 * Provider name matching is case-insensitive. Well-known aliases
 * (e.g. `amazon_bedrock` -> `bedrock`) are resolved automatically.
 */
export function getModelsForProvider(provider: string): Model[] {
  const name = resolveProviderName(provider).toLowerCase()
  return getAllModels().filter((m) => m.provider.toLowerCase() === name)
}

/**
 * Find a specific model within a provider's model list.
 *
 * For Bedrock models, tries the original model ID first (some models in
 * models.dev include the regional prefix), then falls back to stripping
 * the prefix (`eu.`, `us.`, `apac.`) for models that don't.
 */
export function getModelForProvider(provider: string, modelId: string): Model | undefined {
  const models = getModelsForProvider(provider)
  const match = findModel(models, modelId)
  if (match) return match

  const resolvedProvider = resolveProviderName(provider).toLowerCase()
  if (resolvedProvider === "amazon-bedrock") {
    const stripped = stripBedrockRegionPrefix(modelId)
    if (stripped !== modelId) {
      return findModel(models, stripped)
    }
  }

  return undefined
}

/**
 * Look up the per-1M-token cost specification for a provider/model pair.
 *
 * Returns `{ costImplemented: true, cost }` when pricing is available,
 * or `{ costImplemented: false, cost: { input: 0, output: 0 } }` otherwise.
 */
export function getCostSpec(provider: string, modelId: string): CostLookupResult {
  const NOT_IMPLEMENTED: CostLookupResult = {
    cost: { input: 0, output: 0 },
    costImplemented: false,
  }

  try {
    const model = getModelForProvider(provider, modelId)
    if (!model) return NOT_IMPLEMENTED

    const pricing = getModelPricing(model)
    if (!pricing) return NOT_IMPLEMENTED

    return {
      cost: {
        input: pricing.input,
        output: pricing.output,
        reasoning: pricing.reasoning,
        cacheRead: pricing.cacheRead,
        cacheWrite: pricing.cacheWrite,
      },
      costImplemented: true,
    }
  } catch {
    return NOT_IMPLEMENTED
  }
}

/**
 * Estimate the total cost (in USD) for a provider/model and token usage.
 */
export function estimateCost(provider: string, modelId: string, usage: TokenUsage): number {
  const { cost } = getCostSpec(provider, modelId)
  return estimateTotalCost(cost, usage)
}

/**
 * Produce a detailed cost breakdown for a provider/model and token usage.
 */
export function estimateCostWithBreakdown(provider: string, modelId: string, usage: TokenUsage): CostBreakdown {
  const { cost } = getCostSpec(provider, modelId)
  return computeCostBreakdown(cost, usage)
}

/**
 * Build a `provider/model` key suitable for use as a cost-breakdown map key.
 */
export function costBreakdownKey(provider: string, modelId: string): string {
  return `${provider}/${modelId}`
}

/**
 * Format a model into a human-readable summary string.
 *
 * Includes name, modalities, features, context window, pricing,
 * and knowledge cutoff when available.
 */
export function formatModel(model: Model): string {
  const lines: string[] = [`${model.name} (${model.id})`]

  if (model.modalities) {
    const input = model.modalities.input?.join(", ")
    const output = model.modalities.output?.join(", ")
    if (input) lines.push(`Input modalities: ${input}`)
    if (output) lines.push(`Output modalities: ${output}`)
  }

  const features: string[] = []
  if (model.supportsTemperature) features.push("temperature")
  else lines.push("Temperature not supported")
  if (model.toolCall) features.push("tool calling")
  if (model.reasoning) features.push("reasoning")
  if (model.structuredOutput) features.push("structured output")
  if (model.attachment) features.push("attachments")
  if (features.length) lines.push(`Supported features: ${features.join(", ")}`)

  if (model.contextLimit || model.outputLimit) {
    const parts: string[] = []
    if (model.contextLimit) parts.push(`input: ${formatCount(model.contextLimit)}`)
    if (model.outputLimit) parts.push(`output: ${formatCount(model.outputLimit)}`)
    if (parts.length) lines.push(`Context window: ${parts.join(", ")}`)
  }

  if (model.pricing) {
    const parts: string[] = []
    if (model.pricing.input !== undefined) parts.push(`input: ${formatPrice(model.pricing.input)}`)
    if (model.pricing.output !== undefined) parts.push(`output: ${formatPrice(model.pricing.output)}`)
    if (model.pricing.cacheRead !== undefined) parts.push(`cache read: ${formatPrice(model.pricing.cacheRead)}`)
    if (model.pricing.cacheWrite !== undefined) parts.push(`cache write: ${formatPrice(model.pricing.cacheWrite)}`)
    if (parts.length) lines.push(`Pricing (per 1M tokens): ${parts.join(", ")}`)
  }

  if (model.knowledgeCutoff) lines.push(`Knowledge cutoff: ${model.knowledgeCutoff}`)

  return lines.join("\n")
}
