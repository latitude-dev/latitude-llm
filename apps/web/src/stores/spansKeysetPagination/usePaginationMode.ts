import { useCallback, useEffect, useMemo, useState } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { API_ROUTES } from '$/services/routes/api'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { serializeSpans } from './utils'
import type {
  SpansKeysetPaginationResult,
  UseSpansKeysetPaginationParams,
} from './types'

export function usePaginationMode(
  params: UseSpansKeysetPaginationParams,
  filters: Record<string, unknown>,
  opts?: SWRConfiguration<SpansKeysetPaginationResult>,
) {
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([])
  const [currentCursor, setCurrentCursor] = useState<string | null>(null)
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters])

  const filtersParam = useMemo(() => {
    const hasFilters = Object.keys(filters).length > 0
    return hasFilters ? JSON.stringify(filters) : undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey])

  const fetcher = useFetcher<SpansKeysetPaginationResult>(
    API_ROUTES.spans.limited.root,
    {
      serializer: (data: unknown) => {
        const result = data as SpansKeysetPaginationResult
        return {
          items: serializeSpans(result.items),
          count: result.count,
          next: result.next,
        }
      },
      searchParams: compactObject({
        projectId: params.projectId,
        commitUuid: params.commitUuid ?? undefined,
        documentUuid: params.documentUuid,
        from: currentCursor ?? undefined,
        type: params.type,
        limit: params.limit?.toString(),
        source: params.source?.join(','),
        filters: filtersParam,
      }) as Record<string, string>,
    },
  )

  const { data, error, isLoading, mutate } =
    useSWR<SpansKeysetPaginationResult>(
      [
        'spansKeysetPagination',
        params.projectId,
        params.commitUuid,
        params.documentUuid,
        params.source,
        currentCursor,
        params.type,
        params.limit,
        filtersKey,
      ],
      fetcher,
      {
        ...opts,
        keepPreviousData: true,
        fallbackData:
          params.initialItems && params.initialItems.length > 0
            ? {
                count: null,
                items: params.initialItems,
                next: params.initialItems.at(-1)!.startedAt.toISOString(),
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
    if (previousCursor !== undefined) {
      setCursorHistory((prev) => prev.slice(0, -1))
      setCurrentCursor(previousCursor)
    }
  }, [cursorHistory, isLoading])

  const reset = useCallback(() => {
    setCursorHistory([])
    setCurrentCursor(null)
  }, [])

  useEffect(() => {
    if (!params.realtime) {
      setCursorHistory([])
      setCurrentCursor(null)
    }
  }, [params.realtime, filtersKey])

  return {
    data,
    error,
    isLoading,
    mutate,
    goToNextPage,
    goToPrevPage,
    reset,
    currentCursor,
    cursorHistoryLength: cursorHistory.length,
  }
}
