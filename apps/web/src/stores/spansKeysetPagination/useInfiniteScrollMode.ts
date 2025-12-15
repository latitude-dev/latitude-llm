import { useCallback, useEffect, useMemo } from 'react'
import useSWRInfinite, { SWRInfiniteConfiguration } from 'swr/infinite'
import { executeFetch } from '$/hooks/useFetcher'
import { API_ROUTES } from '$/services/routes/api'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useNavigate } from '$/hooks/useNavigate'
import { useCurrentUrl } from '$/hooks/useCurrentUrl'
import { serializeSpans } from './utils'
import type {
  SpansKeysetPaginationResult,
  UseSpansKeysetPaginationParams,
} from './types'

export function useInfiniteScrollMode(
  params: UseSpansKeysetPaginationParams,
  filters: Record<string, unknown>,
  opts?: SWRInfiniteConfiguration<SpansKeysetPaginationResult>,
) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const currentUrl = useCurrentUrl()
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters])

  const getKey = useCallback(
    (
      pageIndex: number,
      previousPageData: SpansKeysetPaginationResult | null,
    ) => {
      if (pageIndex === 0) {
        return [
          'spansKeysetPaginationInfinite',
          params.projectId,
          params.commitUuid,
          params.documentUuid,
          params.source,
          params.type,
          params.limit,
          filtersKey,
          null,
        ] as const
      }

      if (!previousPageData?.next) {
        return null
      }

      return [
        'spansKeysetPaginationInfinite',
        params.projectId,
        params.commitUuid,
        params.documentUuid,
        params.source,
        params.type,
        params.limit,
        filtersKey,
        previousPageData.next,
      ] as const
    },
    [
      params.projectId,
      params.commitUuid,
      params.documentUuid,
      params.source,
      params.type,
      params.limit,
      filtersKey,
    ],
  )

  const filtersParam = useMemo(() => {
    const hasFilters = Object.keys(filters).length > 0
    return hasFilters ? JSON.stringify(filters) : undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey])

  const infiniteFetcher = useCallback(
    async (key: readonly unknown[]) => {
      const cursor = key[8] as string | null | undefined
      const result = await executeFetch<SpansKeysetPaginationResult>({
        route: API_ROUTES.spans.limited.root,
        searchParams: compactObject({
          projectId: params.projectId,
          commitUuid: params.commitUuid ?? undefined,
          documentUuid: params.documentUuid,
          from: cursor ?? undefined,
          type: params.type,
          limit: params.limit?.toString(),
          source: params.source?.join(','),
          filters: filtersParam,
        }) as Record<string, string>,
        serializer: (data: unknown) => {
          const result = data as SpansKeysetPaginationResult
          return {
            items: serializeSpans(result.items),
            count: result.count,
            next: result.next,
          }
        },
        toast,
        navigate,
        currentUrl,
      })
      return result as SpansKeysetPaginationResult
    },
    [
      params.projectId,
      params.commitUuid,
      params.documentUuid,
      params.type,
      params.limit,
      params.source,
      filtersParam,
      toast,
      navigate,
      currentUrl,
    ],
  )

  const {
    data,
    error,
    isLoading,
    mutate,
    setSize: setInfiniteSize,
    isValidating,
  } = useSWRInfinite<SpansKeysetPaginationResult>(getKey, infiniteFetcher, {
    ...opts,
    revalidateOnFocus: false,
    fallbackData:
      params.initialItems && params.initialItems.length > 0
        ? [
            {
              count: null,
              items: params.initialItems,
              next: params.initialItems.at(-1)!.startedAt.toISOString(),
            },
          ]
        : undefined,
  })

  const items = useMemo(() => {
    if (!data) return []
    return data.flatMap((page) => page.items)
  }, [data])

  const hasNext = useMemo(() => {
    if (!data) return false
    const lastPage = data[data.length - 1]
    return !!lastPage?.next
  }, [data])

  const goToNextPage = useCallback(() => {
    if (!hasNext) return
    // Only prevent if we're on the initial load (isLoading) or if we're already at max size
    // Allow calling setInfiniteSize even during validation - SWR will handle deduplication
    if (isLoading) return
    setInfiniteSize((prevSize) => prevSize + 1)
  }, [hasNext, isLoading, setInfiniteSize])

  const reset = useCallback(() => {
    setInfiniteSize(1)
  }, [setInfiniteSize])

  useEffect(() => {
    setInfiniteSize(1)
  }, [params.realtime, filtersKey, setInfiniteSize])

  return {
    data,
    items,
    count: data?.[0]?.count ?? null,
    hasNext,
    error,
    isLoading,
    isValidating,
    mutate,
    goToNextPage,
    reset,
  }
}
