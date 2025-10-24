import { useSpansKeysetPaginationStore } from './spansKeysetPagination'
import { SpanType } from '@latitude-data/constants'
import { useMemo } from 'react'

export function useSpansPaginationStore({
  projectId,
  commitUuid,
  documentUuid,
  type = SpanType.Prompt,
}: {
  projectId: string
  commitUuid: string
  documentUuid: string
  type?: SpanType
}) {
  const {
    items: spans,
    hasNext,
    hasPrev,
    isLoading,
    goToNextPage,
    goToPrevPage,
  } = useSpansKeysetPaginationStore({
    projectId,
    commitUuid,
    documentUuid,
    type,
  })

  // Simulate the old pagination interface for compatibility
  const currentPage = useMemo(() => {
    // This is a simplified simulation - in reality we'd need to track the actual page number
    // For now, we'll just return 1 for the first page
    return 1
  }, [])

  const approximateTotalPages = useMemo(() => {
    // Since we don't have total count with keyset pagination, we'll simulate this
    // Return a higher number if there are more pages available
    return hasNext ? 10 : 1
  }, [hasNext])

  return {
    spans,
    hasMore: hasNext,
    hasPrev,
    isLoading,
    currentPage,
    totalCount: approximateTotalPages * 25, // Simulate total count
    approximateTotalPages,
    goToNextPage,
    goToPrevPage,
    refresh: () => {
      // Reset to first page
      window.location.reload()
    },
  }
}
