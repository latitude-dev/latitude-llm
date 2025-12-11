'use client'

import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { ConversationTracesResponse } from '$/app/api/conversations/[conversationId]/route'
import { LastTraceResponse } from '$/app/api/conversations/[conversationId]/last-trace/route'

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

export function useLastTrace(
  {
    documentLogUuid,
  }: {
    documentLogUuid?: string | null
  },
  opts?: SWRConfiguration,
) {
  const route = documentLogUuid
    ? ROUTES.api.conversations.detail(documentLogUuid).lastTrace.root
    : undefined
  const fetcher = useFetcher<LastTraceResponse>(route, {
    fallback: undefined,
  })
  const {
    data = undefined,
    mutate,
    isLoading,
  } = useSWR<LastTraceResponse>(route, fetcher, opts)

  return useMemo(
    () => ({ trace: data?.trace ?? null, mutate, isLoading }),
    [data, mutate, isLoading],
  )
}
