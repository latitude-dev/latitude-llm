'use client'

import { useCallback, useMemo, useState } from 'react'
import useFetcher from '$/hooks/useFetcher'
import { Span, SpanType } from '@latitude-data/constants'
import useSWR, { SWRConfiguration } from 'swr'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { API_ROUTES } from '$/services/routes/api'
import { DEFAULT_PAGINATION_SIZE } from '@latitude-data/core/constants'

export interface SpansKeysetPaginationResult {
  items: Span[]
  count: number | null
  next: string | null
}

export function useSpansKeysetPaginationStore(
  {
    projectId,
    commitUuid,
    documentUuid,
    type = SpanType.Prompt,
    initialItems = [],
    limit = DEFAULT_PAGINATION_SIZE,
  }: {
    projectId: string
    commitUuid: string
    documentUuid: string
    type?: SpanType
    initialItems?: Span[]
    limit?: number
  },
  opts?: SWRConfiguration,
) {
  // Store cursor history for navigation - current cursor and previous cursors
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([])
  const [currentCursor, setCurrentCursor] = useState<string | null>(null)

  const apiUrl = API_ROUTES.projects
    .detail(parseInt(projectId))
    .commits.detail(commitUuid)
    .documents.detail(documentUuid).spans.limited

  const fetcher = useFetcher<
    SpansKeysetPaginationResult,
    SpansKeysetPaginationResult
  >(apiUrl, {
    serializer: ({ items, ...rest }) => ({
      items: serializeSpans(items),
      ...rest,
    }),
    searchParams: compactObject({
      from: currentCursor ?? undefined,
      type,
      limit: limit.toString(),
    }) as Record<string, string>,
  })

  const { data, error, isLoading } = useSWR<SpansKeysetPaginationResult>(
    [
      'spansKeysetPagination',
      projectId,
      commitUuid,
      documentUuid,
      currentCursor,
      type,
      limit,
    ],
    fetcher,
    {
      ...opts,
      keepPreviousData: true,
      fallbackData:
        initialItems.length > 0
          ? {
              count: null,
              items: initialItems,
              next: initialItems.at(-1)!.startedAt.toISOString(),
            }
          : undefined,
    },
  )

  const goToNextPage = useCallback(() => {
    if (!data?.next || isLoading) return

    setCursorHistory((prev) => [...prev, currentCursor])
    setCurrentCursor(data.next)
  }, [data?.next, isLoading, currentCursor])

  const goToPrevPage = useCallback(() => {
    if (cursorHistory.length === 0 || isLoading) return

    const previousCursor = cursorHistory[cursorHistory.length - 1]
    setCursorHistory((prev) => prev.slice(0, -1))
    setCurrentCursor(previousCursor)
  }, [cursorHistory, isLoading])

  const reset = useCallback(() => {
    setCursorHistory([])
    setCurrentCursor(null)
  }, [])

  return useMemo(
    () => ({
      items: data?.items ?? [],
      count: data?.count ?? null,
      hasNext: !!data?.next,
      hasPrev: cursorHistory.length > 0, // Can go back if we have history
      isLoading,
      error,
      goToNextPage,
      goToPrevPage,
      reset,
      // Expose current state for debugging if needed
      currentCursor,
      cursorHistoryLength: cursorHistory.length,
    }),
    [
      data?.items,
      data?.next,
      data?.count,
      cursorHistory.length,
      isLoading,
      error,
      goToNextPage,
      goToPrevPage,
      reset,
      currentCursor,
    ],
  )
}

function serializeSpans(spans: Span[]) {
  return spans.map((span) => ({
    ...span,
    startedAt: new Date(span.startedAt),
  }))
}
