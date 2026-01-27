'use client'

import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { ConversationTracesResponse } from '$/app/api/conversations/[conversationId]/route'

export function getConversationKey(conversationId?: string) {
  return conversationId
    ? ROUTES.api.conversations.detail(conversationId).root
    : undefined
}

export function useConversation(
  {
    conversationId,
  }: {
    conversationId?: string
  },
  opts?: SWRConfiguration,
) {
  const route = getConversationKey(conversationId)
  const fetcher = useFetcher<ConversationTracesResponse>(route, {
    fallback: undefined,
  })
  const {
    data = undefined,
    mutate,
    isLoading,
  } = useSWR<ConversationTracesResponse>(route, fetcher, opts)

  return useMemo(
    () => ({ traces: data?.traces ?? [], mutate, isLoading }),
    [data, mutate, isLoading],
  )
}
