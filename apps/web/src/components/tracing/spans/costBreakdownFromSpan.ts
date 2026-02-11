import { CompletionSpanMetadata } from '@latitude-data/constants'
import {
  CostBreakdown,
  costBreakdownKey,
} from '@latitude-data/constants/costs'

export function buildSpanCostBreakdown(
  metadata: CompletionSpanMetadata,
): CostBreakdown {
  if (!metadata.provider || !metadata.model) return {}

  const key = costBreakdownKey(metadata.provider, metadata.model)
  const promptTokens = metadata.tokens?.prompt ?? 0
  const cachedTokens = metadata.tokens?.cached ?? 0
  const reasoningTokens = metadata.tokens?.reasoning ?? 0
  const completionTokens = metadata.tokens?.completion ?? 0

  const totalInput = promptTokens + cachedTokens
  const totalOutput = reasoningTokens + completionTokens
  const costMillicents = metadata.cost ?? 0
  const costDollars = costMillicents / 100_000
  const totalAll = totalInput + totalOutput

  return {
    [key]: {
      input: {
        prompt: {
          tokens: promptTokens,
          cost:
            costDollars && totalAll > 0
              ? costDollars * (promptTokens / totalAll)
              : undefined,
        },
        cached: {
          tokens: cachedTokens,
          cost:
            costDollars && totalAll > 0
              ? costDollars * (cachedTokens / totalAll)
              : undefined,
        },
      },
      output: {
        reasoning: {
          tokens: reasoningTokens,
          cost:
            costDollars && totalAll > 0
              ? costDollars * (reasoningTokens / totalAll)
              : undefined,
        },
        completion: {
          tokens: completionTokens,
          cost:
            costDollars && totalAll > 0
              ? costDollars * (completionTokens / totalAll)
              : undefined,
        },
      },
    },
  }
}
