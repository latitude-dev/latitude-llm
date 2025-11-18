import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { compact } from 'lodash-es'
import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'

export function useTraceIds(
  {
    conversationId,
  }: {
    conversationId?: string
  },
  opts?: SWRConfiguration,
) {
  const route = conversationId
    ? ROUTES.api.conversations.detail(conversationId).traceIds.root
    : undefined
  const fetcher = useFetcher<string[]>(route)
  const {
    data = [],
    mutate,
    isLoading,
  } = useSWR<string[]>(compact(route), fetcher, opts)

  return useMemo(() => ({ data, mutate, isLoading }), [data, mutate, isLoading])
}
