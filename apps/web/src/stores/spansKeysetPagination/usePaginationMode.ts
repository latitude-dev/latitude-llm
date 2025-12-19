import { useCallback, useEffect, useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { API_ROUTES } from '$/services/routes/api'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { useCursorPagination } from '$/stores/useCursorPagination'
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
  const {
    currentCursor,
    goToNextPage,
    goToPrevPage,
    reset,
    cursorHistoryLength,
  } = useCursorPagination()

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
        types: params.types?.join(','),
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
        params.types,
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

  const handleGoToNextPage = useCallback(() => {
    if (data?.next && !isLoading) {
      goToNextPage(data.next)
    }
  }, [goToNextPage, data?.next, isLoading])

  useEffect(() => {
    if (!params.realtime) reset()
  }, [params.realtime, reset])

  return useMemo(
    () => ({
      data,
      error,
      isLoading,
      mutate,
      goToNextPage: handleGoToNextPage,
      goToPrevPage,
      reset,
      currentCursor,
      cursorHistoryLength,
    }),
    [
      data,
      error,
      isLoading,
      mutate,
      handleGoToNextPage,
      goToPrevPage,
      reset,
      currentCursor,
      cursorHistoryLength,
    ],
  )
}
