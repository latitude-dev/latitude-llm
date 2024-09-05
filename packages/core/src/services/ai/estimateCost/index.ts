import { CompletionTokenUsage } from 'ai'

import { Providers } from '../../../browser'
import { getCostPer1MAnthropic } from './anthropic'
import { getCostPer1MGroq } from './groq'
import { getCostPer1MMistral } from './mistral'
import { getCostPer1MOpenAI } from './openai'

export type ModelCost = { input: number; output: number }

function getCostPer1M({
  provider,
  model,
}: {
  provider: Providers
  model: string
}): ModelCost {
  switch (provider) {
    case Providers.OpenAI:
      return getCostPer1MOpenAI(model)
    case Providers.Groq:
      return getCostPer1MGroq(model)
    case Providers.Anthropic:
      return getCostPer1MAnthropic(model)
    case Providers.Mistral:
      return getCostPer1MMistral(model)
    case Providers.Azure:
      return getCostPer1MOpenAI(model)
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

export function estimateCost({
  usage,
  provider,
  model,
}: {
  usage: CompletionTokenUsage
  provider: Providers
  model: string
}): number {
  const { promptTokens: inputTokens, completionTokens: outputTokens } = usage
  const { input: inputCostPer1MToken, output: outputCostPer1MToken } =
    getCostPer1M({ provider, model })

  const inputCost =
    (inputCostPer1MToken * (isNaN(inputTokens) ? 0 : inputTokens)) / 1_000_000
  const outputCost =
    (outputCostPer1MToken * (isNaN(outputTokens) ? 0 : outputTokens)) /
    1_000_000

  return inputCost + outputCost
}
