'use client'

import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { parseSpansFilters } from '$/lib/schemas/filters'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { LogSources, Span, SpanType } from '@latitude-data/constants'
import { SWRConfiguration } from 'swr'
import { SWRInfiniteConfiguration } from 'swr/infinite'
import { usePaginationMode } from './usePaginationMode'
import { useInfiniteScrollMode } from './useInfiniteScrollMode'
import { useRealtimeBatching } from './useRealtimeBatching'
import type {
  SpansKeysetPaginationResult,
  UseSpansKeysetPaginationParams,
  UseSpansKeysetPaginationReturn,
} from './types'

export function useSpansKeysetPaginationStore(
  {
    projectId,
    commitUuid,
    documentUuid,
    source,
    type = SpanType.Prompt,
    initialItems = [],
    limit,
    realtime = false,
  }: {
    projectId: string
    commitUuid?: string
    documentUuid?: string
    type?: SpanType
    initialItems?: Span[]
    limit?: number
    source?: LogSources[]
    realtime?: boolean
  },
  opts?: SWRConfiguration<SpansKeysetPaginationResult>,
) {
  const searchParams = useSearchParams()
  const filtersParam = searchParams.get('filters')
  const filters = parseSpansFilters(filtersParam, 'spansKeysetPagination') ?? {}

  const params: UseSpansKeysetPaginationParams = {
    projectId,
    commitUuid,
    documentUuid,
    source,
    type,
    initialItems,
    limit,
    realtime,
  }

  const pagination = usePaginationMode(
    params,
    filters,
    realtime ? undefined : opts,
  )
  const infinite = useInfiniteScrollMode(
    params,
    filters,
    realtime
      ? (opts as SWRInfiniteConfiguration<SpansKeysetPaginationResult>)
      : undefined,
  )

  const { queueSpan } = useRealtimeBatching(
    realtime,
    infinite.isLoading,
    infinite.mutate,
    params,
    filters,
  )

  const onSpanCreated = useCallback(
    (args: EventArgs<'spanCreated'>) => {
      if (!realtime || !args?.span) return
      queueSpan(args.span)
    },
    [realtime, queueSpan],
  )

  useSockets({ event: 'spanCreated', onMessage: onSpanCreated })

  return useMemo<UseSpansKeysetPaginationReturn>(
    () => ({
      items: realtime ? infinite.items : (pagination.data?.items ?? []),
      count: realtime ? infinite.count : (pagination.data?.count ?? null),
      hasNext: realtime ? infinite.hasNext : !!pagination.data?.next,
      hasPrev: realtime ? false : pagination.cursorHistoryLength > 0,
      isLoading: realtime ? infinite.isLoading : pagination.isLoading,
      error: realtime ? infinite.error : pagination.error,
      goToNextPage: realtime ? infinite.goToNextPage : pagination.goToNextPage,
      goToPrevPage: realtime ? () => {} : pagination.goToPrevPage,
      reset: realtime ? infinite.reset : pagination.reset,
      mutate: realtime ? infinite.mutate : pagination.mutate,
      currentCursor: realtime ? null : pagination.currentCursor,
      cursorHistoryLength: realtime ? 0 : pagination.cursorHistoryLength,
    }),
    [
      realtime,
      infinite.items,
      infinite.count,
      infinite.hasNext,
      infinite.isLoading,
      infinite.error,
      infinite.goToNextPage,
      infinite.reset,
      infinite.mutate,
      pagination.data?.items,
      pagination.data?.count,
      pagination.data?.next,
      pagination.cursorHistoryLength,
      pagination.isLoading,
      pagination.error,
      pagination.goToNextPage,
      pagination.goToPrevPage,
      pagination.reset,
      pagination.mutate,
      pagination.currentCursor,
    ],
  )
}

export type { SpansKeysetPaginationResult } from './types'
