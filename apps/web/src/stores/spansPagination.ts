'use client'

import { useCallback, useState } from 'react'
import useFetcher from '$/hooks/useFetcher'
import { Span, SpanType } from '@latitude-data/constants'
import useSWR, { SWRConfiguration } from 'swr'

export interface SpansPaginationResult {
  spans: Span[]
  hasMore: boolean
  nextCursor: string | null
}

export function useSpansPaginationStore(
  {
    projectId,
    commitUuid,
    documentUuid,
    initialSpans,
    initialHasMore,
    type = SpanType.Prompt,
    limit = 50,
  }: {
    projectId: string
    commitUuid: string
    documentUuid: string
    initialSpans: Span[]
    initialHasMore: boolean
    type?: SpanType
    limit?: number
  },
  opts?: SWRConfiguration,
) {
  const [spans, setSpans] = useState(initialSpans)
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const apiUrl = `/api/projects/${projectId}/commits/${commitUuid}/documents/${documentUuid}/spans`
  const params = new URLSearchParams()

  if (cursor && cursor !== '') {
    params.set('cursor', cursor)
  }
  if (limit) {
    params.set('limit', limit.toString())
  }
  if (type) {
    params.set('type', type)
  }

  const url =
    !cursor && spans.length > 0 ? undefined : `${apiUrl}?${params.toString()}`
  const fetcher = useFetcher<SpansPaginationResult>(url, {
    fallback: { spans: [], hasMore: false, nextCursor: null },
  })

  const { data, error, mutate } = useSWR<SpansPaginationResult>(
    url
      ? ['spansPagination', projectId, commitUuid, documentUuid, cursor, limit]
      : null,
    fetcher,
    opts,
  )

  // Update spans when new data is fetched
  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore) return

    setIsLoadingMore(true)
    try {
      // If we don't have a cursor yet, set it to empty string to trigger first fetch
      if (!cursor) {
        setCursor('')
      } else {
        // Otherwise, refetch with the current cursor
        await mutate()
      }
    } finally {
      setIsLoadingMore(false)
    }
  }, [hasMore, isLoadingMore, cursor, mutate])

  // Update spans when new data is fetched
  if (data && data.spans.length > 0 && cursor !== undefined) {
    setSpans((prev) => [...prev, ...data.spans])
    setHasMore(data.hasMore)
    setCursor(data.nextCursor || undefined)
  }

  return {
    spans,
    hasMore,
    isLoading: isLoadingMore,
    error,
    loadMore,
  }
}
