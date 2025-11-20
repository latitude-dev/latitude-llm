'use client'

import { useCallback, useMemo, useState } from 'react'
import useFetcher from '$/hooks/useFetcher'
import { Span, SpanType } from '@latitude-data/constants'
import useSWR, { SWRConfiguration } from 'swr'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { API_ROUTES } from '$/services/routes/api'
import { DEFAULT_PAGINATION_SIZE } from '@latitude-data/core/constants'
import { useSearchParams } from 'next/navigation'
import { parseSpansFilters } from '$/lib/schemas/filters'

export interface SpansKeysetPaginationResult {
  items: Span[]
  count: number | null
  next: string | null
}

type SpansPaginationState = {
  cursorHistory: (string | null)[]
  currentCursor: string | null
}

const EMPTY_STATE: SpansPaginationState = {
  cursorHistory: [],
  currentCursor: null,
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
  const searchParams = useSearchParams()
  const filtersParam = searchParams.get('filters')
  const filters = parseSpansFilters(filtersParam, 'spansKeysetPagination')
  const [paginationState, setPaginationState] =
    useState<SpansPaginationState>(EMPTY_STATE)
  const { cursorHistory, currentCursor } = paginationState
  const setCurrentCursor = useCallback((cursor: string | null) => {
    setPaginationState((prev) => ({
      ...prev,
      currentCursor: cursor,
    }))
  }, [])
  const pushCursorToHistory = useCallback((cursor: string | null) => {
    setPaginationState((prev) => ({
      ...prev,
      cursorHistory: [...prev.cursorHistory, cursor],
    }))
  }, [])
  const popCursorFromHistory = useCallback(() => {
    let previousCursor: string | null = null
    setPaginationState((prev) => {
      if (prev.cursorHistory.length === 0) return prev

      previousCursor = prev.cursorHistory[prev.cursorHistory.length - 1]
      return {
        ...prev,
        cursorHistory: prev.cursorHistory.slice(0, -1),
      }
    })
    return previousCursor
  }, [])
  const reset = useCallback(() => {
    setPaginationState(EMPTY_STATE)
  }, [])
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
      filters: filters ? JSON.stringify(filters) : undefined,
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
      filters,
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

    pushCursorToHistory(currentCursor)
    setCurrentCursor(data.next)
  }, [
    data?.next,
    isLoading,
    currentCursor,
    pushCursorToHistory,
    setCurrentCursor,
  ])
  const goToPrevPage = useCallback(() => {
    if (cursorHistory.length === 0 || isLoading) return

    const previousCursor = popCursorFromHistory()
    if (previousCursor !== null) {
      setCurrentCursor(previousCursor)
    }
  }, [cursorHistory.length, isLoading, popCursorFromHistory, setCurrentCursor])

  const resetPagination = useCallback(() => {
    reset()
  }, [reset])

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
      reset: resetPagination,
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
      resetPagination,
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
