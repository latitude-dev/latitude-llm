'use client'

import { useCallback, useMemo } from 'react'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { LogSources, Span, SpanType } from '@latitude-data/constants'
import { SWRConfiguration } from 'swr'
import { SWRInfiniteConfiguration } from 'swr/infinite'
import { SpansFilters } from '$/lib/schemas/filters'
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
    types = [SpanType.Prompt, SpanType.External],
    initialItems = [],
    limit,
    realtime = false,
    filters,
  }: {
    projectId: string
    commitUuid?: string
    documentUuid?: string
    types?: SpanType[]
    initialItems?: Span[]
    limit?: number
    source?: LogSources[]
    realtime?: boolean
    filters?: SpansFilters
  },
  opts?: SWRConfiguration<SpansKeysetPaginationResult>,
) {
  const normalizedFilters = filters ?? {}
  const params: UseSpansKeysetPaginationParams = {
    projectId,
    commitUuid,
    documentUuid,
    source,
    types,
    initialItems,
    limit,
    realtime,
  }

  const pagination = usePaginationMode(
    params,
    normalizedFilters,
    realtime ? undefined : opts,
  )
  const infinite = useInfiniteScrollMode(
    params,
    normalizedFilters,
    realtime
      ? (opts as SWRInfiniteConfiguration<SpansKeysetPaginationResult>)
      : undefined,
  )

  const { queueSpan } = useRealtimeBatching(
    realtime,
    infinite.isLoading,
    infinite.mutate,
    params,
    normalizedFilters,
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
