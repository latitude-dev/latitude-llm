import { LanguageModelUsage } from 'ai'

import { Providers } from '../../../browser'
import { GROQ_MODELS } from './groq'
import { OPENAI_MODELS } from './openai'
import { ANTHROPIC_MODELS } from './anthropic'
import { MISTRAL_MODELS } from './mistral'
import { GOOGLE_MODELS } from './google'
import { VERTEX_GOOGLE_MODELS } from './vertexGoogle'
import { VERTEX_ANTHROPIC_MODELS } from './vertexAnthropic'
import { XAI_MODELS } from './xai'
import { AMAZON_BEDROCK_MODELS } from './amazonBedrock'
import { DEEPSEEK_MODELS } from './deepseek'
import { PERPLEXITY_MODELS } from './perplexity'
import { NON_IMPLEMENTED_COST } from './helpers'

export type ModelCost = {
  input: number
  output: number
  tokensRangeStart?: number
}
type ModelCostPer1M = {
  cost: ModelCost | ModelCost[]
  costImplemented: boolean
}

export function getCostPer1M({
  provider,
  model,
}: {
  provider: Providers
  model: string
}): ModelCostPer1M {
  switch (provider) {
    case Providers.OpenAI:
      return OPENAI_MODELS.getCost(model)
    case Providers.Groq:
      return GROQ_MODELS.getCost(model)
    case Providers.Anthropic:
      return ANTHROPIC_MODELS.getCost(model)
    case Providers.Mistral:
      return MISTRAL_MODELS.getCost(model)
    case Providers.Google:
      return GOOGLE_MODELS.getCost(model)
    case Providers.GoogleVertex:
      return VERTEX_GOOGLE_MODELS.getCost(model)
    case Providers.AnthropicVertex:
      return VERTEX_ANTHROPIC_MODELS.getCost(model)
    case Providers.XAI:
      return XAI_MODELS.getCost(model)
    case Providers.AmazonBedrock:
      return AMAZON_BEDROCK_MODELS.getCost(model)
    case Providers.DeepSeek:
      return DEEPSEEK_MODELS.getCost(model)
    case Providers.Perplexity:
      return PERPLEXITY_MODELS.getCost(model)
    case Providers.Azure:
      return NON_IMPLEMENTED_COST
    case Providers.Custom:
      return NON_IMPLEMENTED_COST
    default:
      return NON_IMPLEMENTED_COST
  }
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
  const { inputTokens, outputTokens } = usage
  const costSpec = getCostPer1M({ provider, model }).cost

  // Guard against NaN token counts.
  const validInputTokens = inputTokens === undefined || isNaN(inputTokens) ? 0 : inputTokens
  const validOutputTokens = outputTokens === undefined || isNaN(outputTokens) ? 0 : outputTokens

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
