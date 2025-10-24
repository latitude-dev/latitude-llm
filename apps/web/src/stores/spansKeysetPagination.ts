'use client'

import { useCallback, useState } from 'react'
import useFetcher from '$/hooks/useFetcher'
import { Span, SpanType } from '@latitude-data/constants'
import useSWR, { SWRConfiguration } from 'swr'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { API_ROUTES } from '$/services/routes/api'

export interface SpansKeysetPaginationResult {
  items: Span[]
  next: string | null
  prev: string | null
}

export function useSpansKeysetPaginationStore(
  {
    projectId,
    commitUuid,
    documentUuid,
    type = SpanType.Prompt,
    initialItems = [],
  }: {
    projectId: string
    commitUuid: string
    documentUuid: string
    type?: SpanType
    initialItems?: Span[]
  },
  opts?: SWRConfiguration,
) {
  const [from, setFrom] = useState<string | null>(null)
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')

  const apiUrl = API_ROUTES.projects
    .detail(parseInt(projectId))
    .commits.detail(commitUuid)
    .documents.detail(documentUuid).spans.limited

  const fetcher = useFetcher<SpansKeysetPaginationResult>(apiUrl, {
    searchParams: compactObject({
      from: from ?? undefined,
      direction,
      type,
    }) as Record<string, string>,
  })

  const { data, error, isLoading } = useSWR<SpansKeysetPaginationResult>(
    [
      'spansKeysetPagination',
      projectId,
      commitUuid,
      documentUuid,
      from,
      direction,
      type,
    ],
    fetcher,
    { ...opts, fallbackData: { items: initialItems, next: null, prev: null } },
  )

  const goToNextPage = useCallback(() => {
    if (!data?.next || isLoading) return
    setFrom(data.next)
    setDirection('forward')
  }, [data?.next, isLoading])

  const goToPrevPage = useCallback(() => {
    if (!data?.prev || isLoading) return
    setFrom(data.prev)
    setDirection('backward')
  }, [data?.prev, isLoading])

  const reset = useCallback(() => {
    setFrom(null)
    setDirection('forward')
  }, [])

  return {
    items: data?.items ?? [],
    hasNext: !!data?.next,
    hasPrev: !!data?.prev,
    isLoading,
    error,
    goToNextPage,
    goToPrevPage,
    reset,
  }
}
