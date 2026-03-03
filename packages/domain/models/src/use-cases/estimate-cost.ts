import type { CostBreakdown, CostLookupResult, TokenUsage } from "../entities/cost.ts"
import type { ModelRepository } from "../ports/model-repository.ts"
import { computeCostBreakdown, estimateTotalCost } from "./compute-cost.ts"
import { findModel, getModelPricing } from "./find-model.ts"

const PROVIDER_ALIASES: Record<string, string> = {
  amazon_bedrock: "bedrock",
  google_vertex: "google-vertex",
  anthropic_vertex: "anthropic-vertex",
}

function resolveProviderName(provider: string): string {
  return PROVIDER_ALIASES[provider] ?? provider
}

/**
 * Creates cost estimation use-cases bound to a ModelRepository.
 *
 * The repository is injected once; the returned functions use it
 * to look up model data for cost calculations.
 */
export const createCostEstimator = (repository: ModelRepository) => {
  async function getModelsForProvider(provider: string) {
    const name = resolveProviderName(provider).toLowerCase()
    const models = await repository.getAllModels()
    return models.filter((m) => m.provider.toLowerCase() === name)
  }

  async function getModelForProvider(provider: string, modelId: string) {
    const models = await getModelsForProvider(provider)
    return findModel(models, modelId)
  }

  async function getCostSpec(provider: string, modelId: string): Promise<CostLookupResult> {
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

  async function estimateCost(provider: string, modelId: string, usage: TokenUsage): Promise<number> {
    const { cost } = await getCostSpec(provider, modelId)
    return estimateTotalCost(cost, usage)
  }

  async function estimateCostWithBreakdown(
    provider: string,
    modelId: string,
    usage: TokenUsage,
  ): Promise<CostBreakdown> {
    const { cost } = await getCostSpec(provider, modelId)
    return computeCostBreakdown(cost, usage)
  }

  return {
    getModelsForProvider,
    getModelForProvider,
    getCostSpec,
    estimateCost,
    estimateCostWithBreakdown,
  }
}
