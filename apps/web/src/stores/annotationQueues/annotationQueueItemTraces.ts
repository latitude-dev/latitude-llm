'use client'

import { useMemo } from 'react'
import { useTrace } from '$/stores/traces'
import { useConversation } from '$/stores/conversations/useConversation'
import { AssembledTrace, isMainSpan } from '@latitude-data/constants'

function extractConversationParams(trace: AssembledTrace | undefined) {
  if (!trace) return null
  for (const span of trace.children) {
    if (isMainSpan(span) && span.documentLogUuid) {
      return {
        documentLogUuid: span.documentLogUuid,
        commitUuid: span.commitUuid ?? '',
        documentUuid: span.documentUuid ?? '',
      }
    }
  }
  return null
}

export function useAnnotationQueueItemTraces({
  traceId,
  projectId,
}: {
  traceId: string
  projectId: number
}) {
  const { data: trace, isLoading: isLoadingTrace } = useTrace({ traceId })
  const params = extractConversationParams(trace)

  const {
    traces: conversationTraces,
    isLoading: isLoadingConversation,
    totalTokens,
    totalDuration,
    totalCost,
  } = useConversation({
    conversationId: params?.documentLogUuid ?? null,
    projectId,
    commitUuid: params?.commitUuid ?? '',
    documentUuid: params?.documentUuid ?? '',
  })

  return useMemo(() => {
    const hasConversation =
      !!params?.documentLogUuid && conversationTraces.length > 0
    const traces = hasConversation
      ? conversationTraces
      : trace
        ? [trace]
        : []

    return {
      traces,
      isMultiTrace: conversationTraces.length > 1,
      documentLogUuid: params?.documentLogUuid ?? null,
      isLoading:
        isLoadingTrace || (!!params?.documentLogUuid && isLoadingConversation),
      totalTokens,
      totalDuration,
      totalCost,
    }
  }, [
    conversationTraces,
    trace,
    params?.documentLogUuid,
    isLoadingTrace,
    isLoadingConversation,
    totalTokens,
    totalDuration,
    totalCost,
  ])
}
