'use client'

import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { ConversationTracesResponse } from '$/app/api/conversations/[conversationId]/route'

export function getConversationKey(
  conversationId?: string,
  projectId?: number,
  commitUuid?: string,
  documentUuid?: string,
) {
  if (!conversationId) return undefined
  const base = ROUTES.api.conversations.detail(conversationId).root
  const params = new URLSearchParams()
  if (projectId) params.set('projectId', String(projectId))
  if (commitUuid) params.set('commitUuid', commitUuid)
  if (documentUuid) params.set('documentUuid', documentUuid)
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

export function useConversation(
  {
    conversationId,
    projectId,
    commitUuid,
    documentUuid,
  }: {
    conversationId?: string
    projectId?: number
    commitUuid?: string
    documentUuid?: string
  },
  opts?: SWRConfiguration,
) {
  const route = getConversationKey(
    conversationId,
    projectId,
    commitUuid,
    documentUuid,
  )
  const fetcher = useFetcher<ConversationTracesResponse>(route, {
    fallback: undefined,
  })
  const {
    data = undefined,
    mutate,
    isLoading,
  } = useSWR<ConversationTracesResponse>(route, fetcher, opts)

  return useMemo(
    () => ({
      traces: data?.traces ?? [],
      messages: data?.messages ?? [],
      outputMessages: data?.outputMessages ?? [],
      totalTokens: data?.totalTokens ?? 0,
      totalDuration: data?.totalDuration ?? 0,
      totalCost: data?.totalCost ?? 0,
      traceCount: data?.traceCount ?? 0,
      documentLogUuid: data?.documentLogUuid ?? null,
      commitUuid: data?.commitUuid ?? null,
      promptName: data?.promptName ?? null,
      parameters: data?.parameters ?? null,
      startedAt: data?.startedAt ?? null,
      mutate,
      isLoading,
    }),
    [data, mutate, isLoading],
  )
}
