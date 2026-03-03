import {
  type CostBreakdown,
  type CostLookupResult,
  type Model,
  type TokenUsage,
  computeCostBreakdown,
  estimateTotalCost,
  findModel,
  getModelPricing,
  parseModelsDevData,
} from "@domain/models"

import bundledJson from "./data/models.dev.json" with { type: "json" }

const MODELS_DEV_API_URL = "https://models.dev/api.json"
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 10_000

type ModelsCache = {
  models: Model[]
  fetchedAt: number
}

let cache: ModelsCache | null = null
let fetchInFlight: Promise<Model[]> | null = null

const PROVIDER_ALIASES: Record<string, string> = {
  amazon_bedrock: "bedrock",
  google_vertex: "google-vertex",
  anthropic_vertex: "anthropic-vertex",
}

function resolveProviderName(provider: string): string {
  return PROVIDER_ALIASES[provider] ?? provider
}

function loadBundledModels(): Model[] {
  return parseModelsDevData(bundledJson)
}

async function fetchFromApi(): Promise<Model[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(MODELS_DEV_API_URL, {
      signal: controller.signal,
      headers: { "Cache-Control": "no-cache" },
    })

    if (!response.ok) {
      throw new Error(`models.dev API returned ${response.status}`)
    }

    const data = await response.json()
    return parseModelsDevData(data)
  } finally {
    clearTimeout(timeoutId)
  }
}

function getCachedIfValid(): Model[] | null {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.models
  }
  return null
}

function ensureBundledFallback(): Model[] {
  if (!cache) {
    cache = { models: loadBundledModels(), fetchedAt: Date.now() }
  }
  return cache.models
}

/**
 * Get all models, using a 24-hour in-memory cache.
 *
 * On the first call, fetches from the models.dev API (falling back to
 * bundled data on failure). Subsequent calls within 24 hours return the
 * cached result. After the TTL expires, a fresh fetch is triggered.
 */
export async function getAllModels(): Promise<Model[]> {
  const cached = getCachedIfValid()
  if (cached) return cached

  if (!fetchInFlight) {
    fetchInFlight = fetchFromApi()
      .then((models) => {
        cache = { models, fetchedAt: Date.now() }
        return models
      })
      .catch(() => ensureBundledFallback())
      .finally(() => {
        fetchInFlight = null
      })
  }

  if (cache) return cache.models

  return fetchInFlight
}

/**
 * Get all models for a specific provider.
 *
 * Provider name matching is case-insensitive. Well-known aliases
 * (e.g. `amazon_bedrock` -> `bedrock`) are resolved automatically.
 */
export async function getModelsForProvider(provider: string): Promise<Model[]> {
  const name = resolveProviderName(provider).toLowerCase()
  const models = await getAllModels()
  return models.filter((m) => m.provider.toLowerCase() === name)
}

/**
 * Find a specific model within a provider's model list.
 */
export async function getModelForProvider(provider: string, modelId: string): Promise<Model | undefined> {
  const models = await getModelsForProvider(provider)
  return findModel(models, modelId)
}

/**
 * Look up the per-1M-token cost specification for a provider/model pair.
 *
 * Returns `{ costImplemented: true, cost }` when pricing is available,
 * or `{ costImplemented: false, cost: { input: 0, output: 0 } }` otherwise.
 */
export async function getCostSpec(provider: string, modelId: string): Promise<CostLookupResult> {
  const NOT_IMPLEMENTED: CostLookupResult = {
    cost: { input: 0, output: 0 },
    costImplemented: false,
  }

  try {
    const model = await getModelForProvider(provider, modelId)
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
export async function estimateCost(provider: string, modelId: string, usage: TokenUsage): Promise<number> {
  const { cost } = await getCostSpec(provider, modelId)
  return estimateTotalCost(cost, usage)
}

/**
 * Produce a detailed cost breakdown for a provider/model and token usage.
 */
export async function estimateCostWithBreakdown(
  provider: string,
  modelId: string,
  usage: TokenUsage,
): Promise<CostBreakdown> {
  const { cost } = await getCostSpec(provider, modelId)
  return computeCostBreakdown(cost, usage)
}

/**
 * Build a `provider/model` key suitable for use as a cost-breakdown map key.
 */
export function costBreakdownKey(provider: string, modelId: string): string {
  return `${provider}/${modelId}`
}

/**
 * Force-refresh the model cache from the models.dev API.
 * Useful for testing or manual cache invalidation.
 */
export async function refreshModels(): Promise<Model[]> {
  cache = null
  return getAllModels()
}

/**
 * Clear the model cache entirely.
 * Primarily useful for testing.
 */
export function clearCache(): void {
  cache = null
  fetchInFlight = null
}
