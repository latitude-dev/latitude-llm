import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useSpansKeysetPaginationStore } from '$/stores/spansKeysetPagination'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useSpan } from '$/stores/spans'
import { useCallback } from 'react'

export function useLogHistoryParams({
  document,
  commitVersionUuid,
}: {
  document: DocumentVersion
  commitVersionUuid: string
}) {
  const { project } = useCurrentProject()

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const spanId = searchParams.get('spanId')
  const traceId = searchParams.get('traceId')
  const { data: urlSpan, isLoading: isLoadingUrlSpan } = useSpan({
    spanId,
    traceId,
  })

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
