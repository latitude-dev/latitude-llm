import { useMemo } from 'react'
import { useTrace } from '$/stores/traces'
import { CompletionSpanMetadata, SpanType } from '@latitude-data/constants'
import { findAllSpansOfType } from '@latitude-data/core/services/tracing/spans/fetching/findAllSpansOfType'
import { findLastSpanOfType } from '@latitude-data/core/services/tracing/spans/fetching/findLastSpanOfType'
import { findSpanById } from '@latitude-data/core/services/tracing/spans/fetching/findSpanById'

type AggregatedCompletionData = {
  finishReason?: CompletionSpanMetadata['finishReason']
  cost: number
  tokens: {
    prompt: number
    cached: number
    reasoning: number
    completion: number
  }
}

export function useSpanCompletionData({
  traceId,
  spanId,
}: {
  traceId: string
  spanId: string
}) {
  const { data: trace } = useTrace({ traceId })

  const assembledSpan = useMemo(() => {
    if (!trace) return undefined
    return findSpanById(trace.children, spanId)
  }, [trace, spanId])

  const completionSpan = useMemo(() => {
    if (!assembledSpan) return undefined

    return findLastSpanOfType({
      children: assembledSpan.children,
      spanType: SpanType.Completion,
      searchNestedAgents: false,
    })
  }, [assembledSpan])

  const completionSpans = useMemo(
    () =>
      findAllSpansOfType(assembledSpan?.children ?? [], SpanType.Completion),
    [assembledSpan],
  )

  const aggregatedMetadata = useMemo(() => {
    if (!completionSpans.length) return undefined

    return completionSpans.reduce<AggregatedCompletionData>(
      (acc, span) => {
        const metadata = span.metadata as CompletionSpanMetadata | undefined
        if (!metadata) return acc

        return {
          finishReason: metadata.finishReason,
          cost: acc.cost + (metadata.cost || 0),
          tokens: {
            prompt: acc.tokens.prompt + (metadata.tokens?.prompt || 0),
            cached: acc.tokens.cached + (metadata.tokens?.cached || 0),
            reasoning: acc.tokens.reasoning + (metadata.tokens?.reasoning || 0),
            completion:
              acc.tokens.completion + (metadata.tokens?.completion || 0),
          },
        }
      },
      {
        finishReason: undefined,
        cost: 0,
        tokens: { prompt: 0, cached: 0, reasoning: 0, completion: 0 },
      },
    )
  }, [completionSpans])

  const completionSpanMetadata = completionSpan?.metadata as
    | CompletionSpanMetadata
    | undefined

  return {
    assembledSpan,
    completionSpan,
    completionSpans,
    aggregatedMetadata,
    completionSpanMetadata,
  }
}
