'use client'

import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { compact } from 'lodash-es'
import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'

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
  const fetcher = useFetcher<string[]>(route)

  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<string[]>(compact(route), fetcher, opts)

  return useMemo(() => ({ data, mutate, ...rest }), [data, mutate, rest])
}
