import {
  CompletionSpanMetadata,
  CompletionSpanTokens,
  SpanType,
  type Providers,
} from '@latitude-data/constants'
import {
  CostBreakdown,
  costBreakdownKey,
  mergeCostBreakdown,
} from '@latitude-data/constants/costs'
import {
  computeCost,
  ModelCost,
} from '@latitude-data/core/services/ai/estimateCost/index'
import { useModelsCost } from '$/stores/modelsCost'
import { useMemo } from 'react'
import { findAllSpansOfType } from '@latitude-data/core/services/tracing/spans/fetching/findAllSpansOfType'
import { FinishReason } from 'ai'
import { useTrace } from '$/stores/traces'
import { findSpanById } from '@latitude-data/core/services/tracing/spans/fetching/findSpanById'
import { findLastSpanOfType } from '@latitude-data/core/services/tracing/spans/fetching/findLastSpanOfType'

/**
 * Estimates the cost breakdown based on the token usage proportions.
 *
 * This is a rough estimate. It assumes all tokens cost the same, which is
 * usually not true. Providers often charge different prices for prompt,
 * completion, reasoning, and cached tokens.
 */
function estimateBreakdownBasedOnTokenProportions({
  provider,
  model,
  tokens,
  totalCost,
}: {
  provider: Providers
  model: string
  tokens: CompletionSpanTokens
  totalCost: number
}): CostBreakdown {
  const key = costBreakdownKey(provider, model)
  const totalTokens =
    tokens.prompt + tokens.cached + tokens.reasoning + tokens.completion

  const promptTokensProportion = tokens.prompt / totalTokens
  const cachedTokensProportion = tokens.cached / totalTokens
  const reasoningTokensProportion = tokens.reasoning / totalTokens
  const completionTokensProportion = tokens.completion / totalTokens

  const promptCost = totalCost * promptTokensProportion
  const cachedCost = totalCost * cachedTokensProportion
  const reasoningCost = totalCost * reasoningTokensProportion
  const completionCost = totalCost * completionTokensProportion

  return {
    [key]: {
      input: {
        prompt: {
          tokens: tokens.prompt,
          cost: promptCost,
        },
        cached: {
          tokens: tokens.cached,
          cost: cachedCost,
        },
      },
      output: {
        reasoning: {
          tokens: tokens.reasoning,
          cost: reasoningCost,
        },
        completion: {
          tokens: tokens.completion,
          cost: completionCost,
        },
      },
    },
  }
}

/**
 * Estimates the cost breakdown based on the actual model cost spec from models.dev
 * It requires the cost specification for the model, which is not always available.
 */
function estimateBreakdownBasedOnActualCost({
  provider,
  model,
  tokens,
  totalCost,
  costSpec,
}: {
  provider: Providers
  model: string
  tokens: CompletionSpanTokens
  totalCost: number
  costSpec: ModelCost | ModelCost[]
}): CostBreakdown {
  const key = costBreakdownKey(provider, model)

  const inputExpectedCost = computeCost({
    costSpec,
    tokens: tokens.prompt,
    tokenType: 'input',
  })

  const cachedExpectedCost = computeCost({
    costSpec,
    tokens: tokens.cached,
    tokenType: 'cacheRead',
  })

  const reasoningExpectedCost = computeCost({
    costSpec,
    tokens: tokens.reasoning,
    tokenType: 'reasoning',
  })

  const completionExpectedCost = computeCost({
    costSpec,
    tokens: tokens.completion,
    tokenType: 'output',
  })

  const totalExpectedCost =
    inputExpectedCost +
    cachedExpectedCost +
    reasoningExpectedCost +
    completionExpectedCost

  const difference = totalCost / totalExpectedCost

  return {
    [key]: {
      input: {
        prompt: {
          tokens: tokens.prompt,
          cost: inputExpectedCost * difference,
        },
        cached: {
          tokens: tokens.cached,
          cost: cachedExpectedCost * difference,
        },
      },
      output: {
        reasoning: {
          tokens: tokens.reasoning,
          cost: reasoningExpectedCost * difference,
        },
        completion: {
          tokens: tokens.completion,
          cost: completionExpectedCost * difference,
        },
      },
    },
  }
}

export function buildCompletionCostBreakdown(
  metadata: CompletionSpanMetadata,
): CostBreakdown {
  if (!metadata.cost || !metadata.provider || !metadata.model) return {}

  return estimateBreakdownBasedOnTokenProportions({
    provider: metadata.provider as Providers,
    model: metadata.model,
    tokens: metadata.tokens ?? {
      prompt: 0,
      cached: 0,
      reasoning: 0,
      completion: 0,
    },
    totalCost: metadata.cost / 100_000,
  })
}

type AggregatedEntry = {
  model: string
  provider: Providers
  tokens: CompletionSpanTokens
  cost: number
  finishReason?: FinishReason
}

export function useAggregatedCompletionSpans({
  traceId,
  spanId,
}: {
  traceId: string
  spanId: string
}) {
  const { data: trace } = useTrace({ traceId })

  const spanNode = useMemo(
    () => findSpanById(trace?.children ?? [], spanId),
    [trace, spanId],
  )

  const childSpans = useMemo(
    () => spanNode?.children ?? trace?.children ?? [],
    [spanNode, trace],
  )

  const completionSpan = useMemo(() => {
    return findLastSpanOfType({
      children: childSpans,
      spanType: SpanType.Completion,
    })
  }, [childSpans])

  const aggregatedMetadata = useMemo(() => {
    const completionSpans = findAllSpansOfType(
      childSpans ?? [],
      SpanType.Completion,
    )

    if (!completionSpans.length) return []

    return completionSpans.reduce<AggregatedEntry[]>((acc, span) => {
      const model = span.metadata?.model ?? 'unknown'
      const provider = (span.metadata?.provider ?? 'unknown') as Providers

      const existing = acc.find(
        (m) => m.model === model && m.provider === provider,
      )

      if (existing) {
        existing.tokens.prompt += span.metadata?.tokens?.prompt ?? 0
        existing.tokens.cached += span.metadata?.tokens?.cached ?? 0
        existing.tokens.reasoning += span.metadata?.tokens?.reasoning ?? 0
        existing.tokens.completion += span.metadata?.tokens?.completion ?? 0
        existing.cost += span.metadata?.cost ?? 0
        existing.finishReason =
          span.metadata?.finishReason ?? existing.finishReason
        return acc
      }

      acc.push({
        model,
        provider,
        tokens: span.metadata?.tokens ?? {
          prompt: 0,
          cached: 0,
          reasoning: 0,
          completion: 0,
        },
        cost: span.metadata?.cost ?? 0,
        finishReason: span.metadata?.finishReason,
      })
      return acc
    }, [])
  }, [childSpans])

  const totals = useMemo(() => {
    if (!aggregatedMetadata.length) return null

    return aggregatedMetadata.reduce(
      (acc, entry) => ({
        costMillicents: acc.costMillicents + entry.cost,
        tokens: {
          prompt: acc.tokens.prompt + entry.tokens.prompt,
          cached: acc.tokens.cached + entry.tokens.cached,
          reasoning: acc.tokens.reasoning + entry.tokens.reasoning,
          completion: acc.tokens.completion + entry.tokens.completion,
        },
        finishReason: entry.finishReason ?? acc.finishReason,
      }),
      {
        costMillicents: 0,
        tokens: { prompt: 0, cached: 0, reasoning: 0, completion: 0 },
        finishReason: undefined as FinishReason | undefined,
      },
    )
  }, [aggregatedMetadata])

  const uniqueModels = useMemo(
    () =>
      aggregatedMetadata
        .map((m) => ({ provider: m.provider, model: m.model }))
        .sort((a, b) => a.provider.localeCompare(b.provider))
        .sort((a, b) => a.model.localeCompare(b.model)),
    [aggregatedMetadata],
  )

  const { data: modelsCost, isLoading: isModelsCostLoading } =
    useModelsCost(uniqueModels)

  const costBreakdown = useMemo(() => {
    if (isModelsCostLoading) return null

    return aggregatedMetadata.reduce<CostBreakdown>((acc, entry) => {
      const key = `${entry.provider}/${entry.model}`
      const modelCostEntry = modelsCost?.[key]
      const tokens = entry.tokens
      const totalCost = entry.cost / 100_000

      let breakdown: CostBreakdown

      if (!modelCostEntry || !modelCostEntry.costImplemented) {
        breakdown = estimateBreakdownBasedOnTokenProportions({
          provider: entry.provider,
          model: entry.model,
          tokens,
          totalCost,
        })
      } else {
        breakdown = estimateBreakdownBasedOnActualCost({
          provider: entry.provider,
          model: entry.model,
          costSpec: modelCostEntry.cost,
          tokens,
          totalCost,
        })
      }

      return mergeCostBreakdown(acc, breakdown)
    }, {})
  }, [aggregatedMetadata, modelsCost, isModelsCostLoading])

  return useMemo(
    () => ({
      completionSpan,
      costBreakdown,
      isLoading: isModelsCostLoading,
      totalCost: totals?.costMillicents ?? 0,
      tokens: totals?.tokens ?? null,
      finishReason: totals?.finishReason,
    }),
    [completionSpan, costBreakdown, isModelsCostLoading, totals],
  )
}
