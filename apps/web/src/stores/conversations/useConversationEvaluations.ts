'use client'

import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { ConversationEvaluationsResponse } from '$/app/api/conversations/[conversationId]/evaluations/route'

export function useConversationEvaluations(
  {
    conversationId,
    enabled = true,
  }: {
    conversationId?: string
    enabled?: boolean
  },
  opts?: SWRConfiguration,
) {
  const route =
    conversationId && enabled
      ? ROUTES.api.conversations.detail(conversationId).evaluations.root
      : undefined

  const fetcher = useFetcher<ConversationEvaluationsResponse>(route, {
    fallback: undefined,
  })

  const { data, isLoading, error, mutate } =
    useSWR<ConversationEvaluationsResponse>(route, fetcher, opts)

  return {
    results: data?.results ?? [],
    isLoading,
    error,
    mutate,
  }
}
