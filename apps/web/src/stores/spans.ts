'use client'

import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { SpanWithDetails } from '@latitude-data/core/browser'
import { compact } from 'lodash-es'
import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'

export function useSpan(
  {
    conversationId,
    traceId,
    spanId,
  }: {
    conversationId: string
    traceId: string
    spanId: string
  },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.conversations
    .detail(conversationId)
    .traces.detail(traceId)
    .spans.detail(spanId).root
  const fetcher = useFetcher<SpanWithDetails>(
    conversationId && traceId && spanId ? route : undefined,
    { fallback: null },
  )

  const {
    data = undefined,
    mutate,
    ...rest
  } = useSWR<SpanWithDetails>(compact(route), fetcher, opts)

  return useMemo(() => ({ data, mutate, ...rest }), [data, mutate, rest])
}
