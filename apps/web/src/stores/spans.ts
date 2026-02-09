import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { compact } from 'lodash-es'
import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import { SpanWithDetails } from '@latitude-data/core/constants'

export function getSpanKey(
  documentLogUuid?: string | null,
  spanId?: string | null,
) {
  const route =
    spanId && documentLogUuid
      ? ROUTES.api.conversations.detail(documentLogUuid).spans.detail(spanId)
          .root
      : undefined
  return { route, key: compact(route) }
}

export function useSpan(
  {
    documentLogUuid,
    spanId,
  }: {
    documentLogUuid?: string | null
    spanId?: string | null
  },
  opts?: SWRConfiguration,
) {
  const { route, key } = getSpanKey(documentLogUuid, spanId)
  const fetcher = useFetcher<
    SpanWithDetails | undefined,
    SpanWithDetails | undefined
  >(route, {
    fallback: null,
    serializer: (span) => serializeSpan(span),
  })

  const {
    data = undefined,
    mutate,
    isLoading,
  } = useSWR<SpanWithDetails | undefined>(key, fetcher, opts)

  return useMemo(() => ({ data, mutate, isLoading }), [data, mutate, isLoading])
}

export function useSpanByTraceId(
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
    spanId && traceId
      ? ROUTES.api.traces.detail(traceId).spans.detail(spanId).root
      : undefined
  const fetcher = useFetcher<
    SpanWithDetails | undefined,
    SpanWithDetails | undefined
  >(route, {
    fallback: null,
    serializer: (span) => serializeSpan(span),
  })

  const {
    data = undefined,
    mutate,
    isLoading,
  } = useSWR<SpanWithDetails | undefined>(compact(route), fetcher, opts)

  return useMemo(() => ({ data, mutate, isLoading }), [data, mutate, isLoading])
}

function serializeSpan(span?: SpanWithDetails) {
  if (!span) return undefined

  return { ...span, startedAt: new Date(span.startedAt) } as SpanWithDetails
}
