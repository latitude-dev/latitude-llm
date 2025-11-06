'use client'

import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { AssembledTraceResponse } from '$/app/api/conversations/[conversationId]/route'

export function useConversation(
  {
    conversationId,
  }: {
    conversationId?: string
  },
  opts?: SWRConfiguration,
) {
  const route = conversationId
    ? ROUTES.api.conversations.detail(conversationId).root
    : undefined
  const fetcher = useFetcher<AssembledTraceResponse>(route, {
    fallback: undefined,
  })
  const {
    data = undefined,
    mutate,
    isLoading,
  } = useSWR<AssembledTraceResponse>(route, fetcher, opts)

  return useMemo(() => ({ data, mutate, isLoading }), [data, mutate, isLoading])
}
