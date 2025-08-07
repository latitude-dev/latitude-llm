'use client'

import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import type { AssembledTrace } from '@latitude-data/core/browser'
import { compact } from 'lodash-es'
import { useMemo } from 'react'
import useSWR, { type SWRConfiguration } from 'swr'

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
  const route = ROUTES.api.conversations.detail(conversationId).traces.detail(traceId).root
  const fetcher = useFetcher<AssembledTrace>(conversationId && traceId ? route : undefined, {
    fallback: null,
  })

  const {
    data = undefined,
    mutate,
    isLoading,
  } = useSWR<AssembledTrace>(compact(route), fetcher, opts)

  return useMemo(() => ({ data, mutate, isLoading }), [data, mutate, isLoading])
}
