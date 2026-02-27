'use client'

import { useCallback, useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { API_ROUTES } from '$/services/routes/api'
import { useCursorPagination } from '$/stores/useCursorPagination'
import { AnnotationQueue } from '@latitude-data/core/schema/models/types/AnnotationQueue'
import { compactObject } from '@latitude-data/core/lib/compactObject'

type AnnotationQueuesResult = {
  items: AnnotationQueue[]
  next: { createdAt: string; id: number } | null
  count: number
}

export function useAnnotationQueues(
  {
    projectId,
    limit = 20,
  }: {
    projectId: number
    limit?: number
  },
  opts?: SWRConfiguration<AnnotationQueuesResult>,
) {
  const {
    currentCursor,
    goToNextPage,
    goToPrevPage,
    reset,
    cursorHistoryLength,
  } = useCursorPagination()

  const cursor = currentCursor
    ? (JSON.parse(currentCursor) as { createdAt: string; id: number })
    : undefined

  const route = API_ROUTES.projects.detail(projectId).annotationQueues.root
  const fetcher = useFetcher<AnnotationQueuesResult>(route, {
    searchParams: compactObject({
      limit: String(limit),
      fromCreatedAt: cursor?.createdAt,
      fromId: cursor?.id != null ? String(cursor.id) : undefined,
    }) as Record<string, string>,
  })

  const { data, error, isLoading, mutate } = useSWR<AnnotationQueuesResult>(
    ['annotationQueues', projectId, currentCursor, limit],
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
      data: data?.items ?? [],
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
