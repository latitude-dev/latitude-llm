import { useCallback, useEffect, useMemo } from 'react'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { useEvaluationParameters } from '../../../hooks/useEvaluationParamaters/index'

import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetricAnyCustom,
} from '@latitude-data/core/constants'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useSpansKeysetPaginationStore } from '$/stores/spansKeysetPagination'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import useFetcher from '$/hooks/useFetcher'
import useSWR from 'swr'
import { ROUTES } from '$/services/routes'
import { ExtractOutputResponse } from '$/app/api/evaluations/extract-output/route'

function useExtractedParameters({
  documentLogUuid,
  evaluationUuid,
  commitUuid,
  documentUuid,
}: {
  documentLogUuid?: string
  evaluationUuid: string
  commitUuid: string
  documentUuid: string
}) {
  const route = ROUTES.api.evaluations.extractOutput.root
  const searchParams = useMemo(
    () =>
      documentLogUuid
        ? {
            documentLogUuid,
            evaluationUuid,
            commitUuid,
            documentUuid,
          }
        : undefined,
    [documentLogUuid, evaluationUuid, commitUuid, documentUuid],
  )

  const fetcher = useFetcher<ExtractOutputResponse>(
    documentLogUuid ? route : undefined,
    { searchParams },
  )

  const { data, isLoading } = useSWR<ExtractOutputResponse>(
    documentLogUuid ? [route, searchParams] : null,
    fetcher,
  )

  return useMemo(
    () => ({
      data: data ?? null,
      isLoading,
    }),
    [data, isLoading],
  )
}

/**
 * `selectedDocumentLogUuid` is the log that comes from
 * the URL when people link to the editor with that documentLog
 */
export function useLogHistoryParams({
  document,
  evaluation,
  commitVersionUuid,
  selectedDocumentLogUuid,
}: {
  document: DocumentVersion
  evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetricAnyCustom>
  commitVersionUuid: string
  selectedDocumentLogUuid?: string
}) {
  const { project } = useCurrentProject()
  const {
    history: { mapLogParametersToInputs },
  } = useEvaluationParameters({
    document,
    evaluation,
    commitVersionUuid,
  })

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

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

  const currentDocumentLogUuid =
    selectedDocumentLogUuid ?? spans?.[0]?.documentLogUuid
  const { data: extractedResponse, isLoading: isLoadingParameters } =
    useExtractedParameters({
      documentLogUuid: currentDocumentLogUuid,
      evaluationUuid: evaluation.uuid,
      commitUuid: commitVersionUuid,
      documentUuid: document.documentUuid,
    })

  useEffect(() => {
    if (!extractedResponse) return
    if (!extractedResponse.ok) return

    mapLogParametersToInputs(extractedResponse)
  }, [extractedResponse, mapLogParametersToInputs])

  const clearUrlSelection = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('spanId')
    params.delete('documentLogUuid')
    router.push(`${pathname}?${params.toString()}`)
  }, [pathname, searchParams, router])

  const isLoading = isLoadingSpans || isLoadingParameters
  const extractionError =
    extractedResponse && !extractedResponse.ok
      ? extractedResponse.error
      : undefined

  return {
    selectedPromptSpan: spans?.[0],
    onNextPage: goToNextPage,
    onPrevPage: goToPrevPage,
    isLoading,
    hasNext,
    hasPrev,
    clearUrlSelection,
    extractionError,
  }
}

export type UseLogHistoryParams = ReturnType<typeof useLogHistoryParams>
