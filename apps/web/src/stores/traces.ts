'use client'

import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import { AssembledTrace } from '@latitude-data/core/constants'
import { SpanMessagesResponse } from '$/app/api/traces/[traceId]/spans/[spanId]/messages/route'

export function useTrace(
  {
    traceId,
  }: {
    traceId?: string | null
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<AssembledTrace>(
    traceId ? ROUTES.api.traces.detail(traceId).root : undefined,
    { fallback: null },
  )

  const {
    data = undefined,
    isLoading,
    mutate,
  } = useSWR<AssembledTrace>(traceId, fetcher, opts)

  return useMemo(() => ({ data, isLoading, mutate }), [data, isLoading, mutate])
}

export function useTraceWithMessages(
  {
    traceId,
    spanId,
  }: {
    traceId?: string | null
    spanId?: string | null
  },
  opts?: SWRConfiguration,
) {
  const route =
    traceId && spanId
      ? ROUTES.api.traces.detail(traceId).spans.detail(spanId).messages
      : undefined
  const fetcher = useFetcher<SpanMessagesResponse>(route, {
    fallback: undefined,
  })

  const {
    data = undefined,
    mutate,
    isLoading,
  } = useSWR<SpanMessagesResponse>(route, fetcher, opts)

  return useMemo(
    () => ({
      trace: data?.trace ?? null,
      completionSpan: data?.completionSpan ?? null,
      mutate,
      isLoading,
    }),
    [data, mutate, isLoading],
  )
}
