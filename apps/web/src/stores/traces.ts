'use client'

import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { compact } from 'lodash-es'
import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import { AssembledTrace } from '@latitude-data/core/constants'

export function useTrace(
  {
    conversationId,
    traceId,
  }: {
    conversationId: string
    traceId: string
  },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.conversations
    .detail(conversationId)
    .traces.detail(traceId).root
  const fetcher = useFetcher<AssembledTrace>(
    conversationId && traceId ? route : undefined,
    { fallback: null },
  )

  const {
    data = undefined,
    mutate,
    ...rest
  } = useSWR<AssembledTrace>(compact(route), fetcher, opts)

  return useMemo(() => ({ data, mutate, ...rest }), [data, mutate, rest])
}
