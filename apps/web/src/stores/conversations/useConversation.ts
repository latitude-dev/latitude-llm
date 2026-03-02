'use client'

import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { ConversationTracesResponse } from '$/app/api/conversations/[conversationId]/route'

type ConversationRouteParams = {
  conversationId: string | null | undefined
  projectId: number
  commitUuid: string
  documentUuid: string
}

export function getConversationKey({
  conversationId,
  projectId,
  commitUuid,
  documentUuid,
}: ConversationRouteParams): string | null {
  if (!conversationId) return null

  const base = ROUTES.api.conversations.detail(conversationId).root
  const params = new URLSearchParams()
  params.set('projectId', String(projectId))
  params.set('commitUuid', commitUuid)
  params.set('documentUuid', documentUuid)
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

export function useConversation(
  {
    conversationId,
    projectId,
    commitUuid,
    documentUuid,
  }: ConversationRouteParams,
  opts?: SWRConfiguration,
) {
  const route = getConversationKey({
    conversationId,
    projectId,
    commitUuid,
    documentUuid,
  })
  const fetcher = useFetcher<ConversationTracesResponse>(
    route ?? undefined,
    { fallback: undefined },
  )
  const {
    data = undefined,
    mutate,
    isLoading,
  } = useSWR<ConversationTracesResponse>(route, fetcher, opts)

  return useMemo(
    () => ({
      traces: data?.traces ?? [],
      messages: data?.messages ?? [],
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
