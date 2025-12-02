import {
  Providers,
  LegacyVercelSDKVersion4Usage as LanguageModelUsage,
} from '@latitude-data/constants'
import {
  getBundledModelsDevData,
  findModelsDevModel,
  getModelsDevPricing,
} from './modelsDev'

export type ModelCost = {
  input: number
  output: number
  tokensRangeStart?: number
}
type ModelCostPer1M = {
  cost: ModelCost | ModelCost[]
  costImplemented: boolean
}

/**
 * Maps Latitude providers to models.dev provider names
 * models.dev uses standardized provider identifiers
 */
function getModelsDevProviderName(provider: Providers): string {
  const providerMap: Record<Providers, string> = {
    [Providers.OpenAI]: 'openai',
    [Providers.Anthropic]: 'anthropic',
    [Providers.Groq]: 'groq',
    [Providers.Mistral]: 'mistral',
    [Providers.Google]: 'google',
    [Providers.GoogleVertex]: 'google-vertex',
    [Providers.AnthropicVertex]: 'anthropic-vertex',
    [Providers.XAI]: 'xai',
    [Providers.AmazonBedrock]: 'bedrock',
    [Providers.DeepSeek]: 'deepseek',
    [Providers.Perplexity]: 'perplexity',
    [Providers.Azure]: 'azure',
    [Providers.Custom]: 'custom',
  }
  return providerMap[provider] || provider
}

/**
 * Gets cost from bundled models.dev data
 * Uses the bundled JSON file for synchronous cost estimation
 */
function getCostFromModelsDev(
  provider: Providers,
  model: string,
): ModelCostPer1M {
  try {
    const modelsData = getBundledModelsDevData()

    const providerName = getModelsDevProviderName(provider)
    const modelData = findModelsDevModel(
      modelsData.filter(
        (m) => m.provider.toLowerCase() === providerName.toLowerCase(),
      ),
      model,
    )

    if (!modelData) {
      return {
        cost: { input: 0, output: 0 },
        costImplemented: false,
      }
    }

    const pricing = getModelsDevPricing(modelData)
    if (!pricing) {
      return {
        cost: { input: 0, output: 0 },
        costImplemented: false,
      }
    }

    return {
      cost: {
        input: pricing.input,
        output: pricing.output,
      },
      costImplemented: true,
    }
  } catch {
    // If anything goes wrong, return not implemented
    return {
      cost: { input: 0, output: 0 },
      costImplemented: false,
    }
  }
}

export function getCostPer1M({
  provider,
  model,
}: {
  provider: Providers
  model: string
}): ModelCostPer1M {
  return getCostFromModelsDev(provider, model)
}

function computeCost({
  costSpec,
  tokens,
  tokenType,
}: {
  costSpec: ModelCost | ModelCost[]
  tokens: number
  tokenType: 'input' | 'output'
}): number {
  const tiers: ModelCost[] = Array.isArray(costSpec) ? costSpec : [costSpec]
  const sortedTiers = tiers
    .slice()
    .sort((a, b) => (a.tokensRangeStart ?? 0) - (b.tokensRangeStart ?? 0))

  let totalCost = 0
  for (let i = 0; i < sortedTiers.length; i++) {
    const cost = sortedTiers[i]
    if (!cost) continue

    const tierStart = cost.tokensRangeStart ?? 0
    const tierEnd =
      i + 1 < sortedTiers.length
        ? (sortedTiers[i + 1]?.tokensRangeStart ?? Infinity)
        : Infinity

    // If the total tokens are less than or equal to the start of this tier,
    // then no tokens fall into this tier.
    if (tokens <= tierStart) break

    // Calculate the number of tokens in the current tier.
    // (For example, if tokens = 200_000, tierStart = 0 and tierEnd = 128_000,
    // then tokensInTier = 128_000. In the next tier, tokensInTier = 200_000 - 128_000.)
    const tokensInTier = Math.min(tokens, tierEnd) - tierStart

    totalCost += (cost[tokenType] * tokensInTier) / 1_000_000
  }

  return totalCost
}

/**
 * Given the usage (number of input and output tokens), a provider and a model name,
 * this function returns the estimated cost by applying the proper cost rates.
 *
 * If the model's cost is defined as an array then we assume it contains multiple tiers.
 * In that case, the first tier applies from token 0 (or from tokensRangeStart=undefined, assumed to be 0)
 * up to the next tier's starting threshold, and so on.
 */
export function estimateCost({
  usage,
  provider,
  model,
}: {
  usage: LanguageModelUsage
  provider: Providers
  model: string
}): number {
  const { promptTokens, completionTokens } = usage
  const costPer1M = getCostPer1M({ provider, model })
  const costSpec = costPer1M.cost

  // Guard against NaN token counts.
  const validInputTokens = isNaN(promptTokens) ? 0 : promptTokens
  const validOutputTokens = isNaN(completionTokens) ? 0 : completionTokens

  const inputCost = computeCost({
    costSpec,
    tokens: validInputTokens,
    tokenType: 'input',
  })
  const outputCost = computeCost({
    costSpec,
    tokens: validOutputTokens,
    tokenType: 'output',
  })

  return inputCost + outputCost
}
