'use client'

import { useCallback, useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { API_ROUTES } from '$/services/routes/api'
import { useCursorPagination } from '$/stores/useCursorPagination'
import { AnnotationQueueItemStatus } from '@latitude-data/constants/annotationQueues'
import { AnnotationQueueItem } from '@latitude-data/core/queries/clickhouse/annotationQueueItems/findItems'
import { compactObject } from '@latitude-data/core/lib/compactObject'

type AnnotationQueueItemsResult = {
  items: AnnotationQueueItem[]
  next: { createdAt: string; traceId: string } | null
  count: number
}

export function useAnnotationQueueItems(
  {
    projectId,
    queueId,
    status,
    limit = 20,
  }: {
    projectId: number
    queueId: number
    status?: AnnotationQueueItemStatus
    limit?: number
  },
  opts?: SWRConfiguration<AnnotationQueueItemsResult>,
) {
  const {
    currentCursor,
    goToNextPage,
    goToPrevPage,
    reset,
    cursorHistoryLength,
  } = useCursorPagination()

  const cursor = currentCursor ? JSON.parse(currentCursor) : undefined

  const route = API_ROUTES.projects
    .detail(projectId)
    .annotationQueues.detail(queueId).items

  const fetcher = useFetcher<AnnotationQueueItemsResult>(route, {
    searchParams: compactObject({
      status: status ?? undefined,
      limit: String(limit),
      fromCreatedAt: cursor?.createdAt,
      fromTraceId: cursor?.traceId,
    }) as Record<string, string>,
  })

  const { data, error, isLoading, mutate } = useSWR<AnnotationQueueItemsResult>(
    ['annotationQueueItems', projectId, queueId, status, currentCursor, limit],
    fetcher,
    { ...opts, keepPreviousData: true },
  )

  const handleGoToNextPage = useCallback(() => {
    if (data?.next && !isLoading) {
      goToNextPage(JSON.stringify(data.next))
    }
  }, [goToNextPage, data?.next, isLoading])

  return useMemo(
    () => ({
      items: data?.items ?? [],
      count: data?.count ?? 0,
      hasNext: !!data?.next,
      hasPrev: cursorHistoryLength > 0,
      isLoading,
      error,
      goToNextPage: handleGoToNextPage,
      goToPrevPage,
      reset,
      mutate,
      page: cursorHistoryLength + 1,
    }),
    [
      data,
      cursorHistoryLength,
      isLoading,
      error,
      handleGoToNextPage,
      goToPrevPage,
      reset,
      mutate,
    ],
  )
}
