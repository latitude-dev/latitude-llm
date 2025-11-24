import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useSpansKeysetPaginationStore } from '$/stores/spansKeysetPagination'
import { PromptSpanMetadata } from '@latitude-data/constants'
import { useOnce } from '$/hooks/useMount'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useSpan } from '$/stores/spans'
import { useCallback, useEffect } from 'react'

export function useLogHistoryParams({
  document,
  commitVersionUuid,
}: {
  document: DocumentVersion
  commitVersionUuid: string
}) {
  const { project } = useCurrentProject()
  const {
    history: { mapDocParametersToInputs },
  } = useDocumentParameters({
    document,
    commitVersionUuid,
  })

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const spanId = searchParams.get('spanId')
  const traceId = searchParams.get('traceId')
  const { data: urlSpan, isLoading: isLoadingUrlSpan } = useSpan({
    spanId,
    traceId,
  })

  useOnce(() => {
    if (!urlSpan) return
    if (!urlSpan.metadata) return

    mapDocParametersToInputs({
      parameters: (urlSpan.metadata as PromptSpanMetadata).parameters,
    })
  }, !!urlSpan)

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
  const { data: selectedSpan, isLoading: isLoadingSelectedSpan } = useSpan(
    {
      spanId: spans?.[0]?.id,
      traceId: spans?.[0]?.traceId,
    },
    {},
  )

  useEffect(() => {
    if (urlSpan) return
    if (!selectedSpan || !selectedSpan.metadata) return

    mapDocParametersToInputs({
      parameters: (selectedSpan.metadata as PromptSpanMetadata).parameters,
    })
    // TODO: mapDocParametersToInputs mutates on each call to itself, so we
    // cannot add it to the deps array. Fix the underlying issue.
    /* eslint-disable react-hooks/exhaustive-deps */
  }, [urlSpan, selectedSpan])

  const clearUrlSelection = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('spanId')
    params.delete('traceId')
    router.push(`${pathname}?${params.toString()}`)
  }, [pathname, searchParams, router])
  const isLoading = isLoadingUrlSpan || isLoadingSpans || isLoadingSelectedSpan

  return {
    urlSpan,
    selectedSpan,
    isLoading,
    hasNext,
    hasPrev,
    onNextPage: goToNextPage,
    onPrevPage: goToPrevPage,
    clearUrlSelection,
  }
}

export type UseLogHistoryParams = ReturnType<typeof useLogHistoryParams>
