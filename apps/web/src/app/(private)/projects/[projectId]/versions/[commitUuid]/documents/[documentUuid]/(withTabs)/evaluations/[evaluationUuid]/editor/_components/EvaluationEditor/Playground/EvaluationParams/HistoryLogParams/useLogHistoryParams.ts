import { useCallback, useEffect } from 'react'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { useEvaluationParameters } from '../../../hooks/useEvaluationParamaters/index'

import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetricAnyCustom,
  SpanType,
} from '@latitude-data/core/constants'
import { useOnce } from '$/hooks/useMount'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useConversation } from '$/stores/conversations'
import { findFirstSpanOfType } from '@latitude-data/core/services/tracing/spans/fetching/findFirstSpanOfType'
import { useSpansKeysetPaginationStore } from '$/stores/spansKeysetPagination'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { findCompletionSpanFromTrace } from '@latitude-data/core/services/tracing/spans/fetching/findCompletionSpanFromTrace'

/**
 * `selectedDocumentLogUuid` is the log that comes from
 * the URL when people link to the editor with that documentLog
 */
export function useLogHistoryParams({
  document,
  evaluation,
  commitVersionUuid,
  selectedTraceId,
}: {
  document: DocumentVersion
  evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetricAnyCustom>
  commitVersionUuid: string
  selectedTraceId?: string
}) {
  const { project } = useCurrentProject()
  const {
    history: { mapLogParametersToInputs },
  } = useEvaluationParameters({
    document,
    evaluation,
    commitVersionUuid,
  })

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { traces, isLoading: isLoadingUrlSpan } = useConversation({
    conversationId: selectedTraceId,
  })
  const trace = traces[0]
  const urlPromptSpan = findFirstSpanOfType(
    trace?.children ?? [],
    SpanType.Prompt,
  )
  const urlCompletionSpan = findCompletionSpanFromTrace(trace)

  const {
    items: spans,
    isLoading: isLoadingSpans,
    hasNext,
    hasPrev,
    goToNextPage,
    goToPrevPage,
  } = useSpansKeysetPaginationStore({
    documentUuid: document.documentUuid,
    projectId: String(project.id),
    commitUuid: commitVersionUuid,
    limit: 1,
  })
  const { traces: selectedTraces, isLoading: isLoadingSelectedSpan } =
    useConversation({
      conversationId: spans?.[0]?.documentLogUuid,
    })
  const selectedTrace = selectedTraces[0]
  const promptSpan = findFirstSpanOfType(
    selectedTrace?.children ?? [],
    SpanType.Prompt,
  )
  useOnce(() => {
    if (!urlPromptSpan || !urlCompletionSpan) return
    if (!urlPromptSpan.metadata || !urlCompletionSpan.metadata) return

    mapLogParametersToInputs({
      promptSpan: urlPromptSpan,
      completionSpan: urlCompletionSpan,
    })
  }, !!urlPromptSpan && !!urlCompletionSpan)

  useEffect(() => {
    if (urlPromptSpan || urlCompletionSpan) return
    if (!promptSpan || !promptSpan.metadata) return

    const completionSpan = findCompletionSpanFromTrace(selectedTrace)
    if (!completionSpan || !completionSpan.metadata) return

    mapLogParametersToInputs({
      promptSpan,
      completionSpan,
    })
    // TODO: mapLogParametersToInputs mutates on each call to itself, so we
    // cannot add it to the deps array. Fix the underlying issue.
    /* eslint-disable react-hooks/exhaustive-deps */
  }, [urlPromptSpan, urlCompletionSpan, promptSpan])

  const clearUrlSelection = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('spanId')
    params.delete('traceId')
    router.push(`${pathname}?${params.toString()}`)
  }, [pathname, searchParams, router])
  const isLoading = isLoadingUrlSpan || isLoadingSpans || isLoadingSelectedSpan
  const selectedPromptSpan = urlPromptSpan || promptSpan

  return {
    urlPromptSpan,
    selectedPromptSpan: selectedPromptSpan,
    onNextPage: goToNextPage,
    onPrevPage: goToPrevPage,
    isLoading,
    hasNext,
    hasPrev,
    clearUrlSelection,
  }
}

export type UseLogHistoryParams = ReturnType<typeof useLogHistoryParams>
