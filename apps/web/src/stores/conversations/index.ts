'use client'

import { useCallback, useMemo } from 'react'
import useSWR, { SWRConfiguration, KeyedMutator } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { API_ROUTES } from '$/services/routes/api'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { useCursorPagination } from '$/stores/useCursorPagination'
import { ConversationsResponse } from '$/app/api/conversations/route'
import { Conversation as DbConversation } from '@latitude-data/core/data-access/conversations/fetchConversation'
import { SpansFilters } from '$/lib/schemas/filters'

type Conversation = Omit<
  DbConversation,
  'startedAt' | 'endedAt' | 'latestStartedAt'
> & {
  startedAt: Date
  endedAt: Date
  latestStartedAt: Date
}

function parseUtcDate(dateStr: string): Date {
  const normalized = dateStr.replace(' ', 'T')
  return new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`)
}

function deserializeConversation(
  item: ConversationsResponse['items'][0],
): Conversation {
  return {
    ...item,
    startedAt: parseUtcDate(item.startedAt),
    endedAt: parseUtcDate(item.endedAt),
    latestStartedAt: parseUtcDate(item.latestStartedAt),
  }
}

type SerializedConversationResponse = Omit<ConversationsResponse, 'items'> & {
  items: Conversation[]
}

function deserializeResponse(
  response: ConversationsResponse,
): SerializedConversationResponse {
  return {
    ...response,
    items: response.items.map(deserializeConversation),
  }
}

export type UseConversationsParams = {
  projectId: number
  commitUuid: string
  documentUuid: string
  filters?: SpansFilters
  limit?: number
}

type ConversationsStoreOpts = Omit<
  SWRConfiguration<SerializedConversationResponse, Error>,
  'fallbackData'
> & {
  fallbackData?: ConversationsResponse
}

export type UseConversationsReturn = {
  items: Conversation[]
  next: string | null
  hasNext: boolean
  hasPrev: boolean
  isLoading: boolean
  error: Error | undefined
  goToNextPage: () => void
  goToPrevPage: () => void
  reset: () => void
  mutate: KeyedMutator<SerializedConversationResponse>
  currentCursor: string | null
  cursorHistoryLength: number
}

export function useConversationsStore(
  {
    projectId,
    commitUuid,
    documentUuid,
    filters = {},
    limit,
  }: UseConversationsParams,
  opts?: ConversationsStoreOpts,
): UseConversationsReturn {
  const {
    currentCursor,
    goToNextPage,
    goToPrevPage,
    reset,
    cursorHistoryLength,
  } = useCursorPagination()

  const filtersParam = useMemo(() => {
    const hasFilters = Object.keys(filters).length > 0
    return hasFilters ? JSON.stringify(filters) : undefined
  }, [filters])

  const searchParams = useMemo(
    () =>
      compactObject({
        projectId: String(projectId),
        commitUuid,
        documentUuid,
        from: currentCursor ?? undefined,
        limit: limit?.toString(),
        filters: filtersParam,
      }) as Record<string, string>,
    [projectId, commitUuid, documentUuid, currentCursor, limit, filtersParam],
  )

  const fetcher = useFetcher<
    SerializedConversationResponse,
    ConversationsResponse
  >(API_ROUTES.conversations.root, {
    serializer: deserializeResponse,
    searchParams,
  })

  const { fallbackData, ...restOpts } = opts ?? {}
  const deserializedFallbackData = useMemo(
    () => (fallbackData ? deserializeResponse(fallbackData) : undefined),
    [fallbackData],
  )

  const { data, error, isLoading, mutate } =
    useSWR<SerializedConversationResponse>(
      [
        'conversationsKeysetPagination',
        projectId,
        commitUuid,
        documentUuid,
        currentCursor,
        limit,
        filtersParam,
      ],
      fetcher,
      {
        ...restOpts,
        fallbackData: deserializedFallbackData,
        revalidateOnMount: !deserializedFallbackData,
        keepPreviousData: true,
      },
    )

  const handleGoToNextPage = useCallback(() => {
    if (data?.next && !isLoading) {
      goToNextPage(data.next)
    }
  }, [goToNextPage, data?.next, isLoading])

  return useMemo(
    () => ({
      items: data?.items ?? [],
      next: data?.next ?? null,
      hasNext: !!data?.next,
      hasPrev: cursorHistoryLength > 0,
      isLoading,
      error,
      goToNextPage: handleGoToNextPage,
      goToPrevPage,
      reset,
      mutate,
      currentCursor,
      cursorHistoryLength,
    }),
    [
      data?.items,
      data?.next,
      cursorHistoryLength,
      isLoading,
      error,
      handleGoToNextPage,
      goToPrevPage,
      reset,
      mutate,
      currentCursor,
    ],
  )
}

export type { Conversation }
export { deserializeConversation }
export { buildConversationUrl, useConversation } from './useConversation'
export { useConversationEvaluations } from './useConversationEvaluations'
