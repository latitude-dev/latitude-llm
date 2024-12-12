import useTracesPagination, {
  serializeTrace,
} from '$/stores/useTracesPagination'
import { useCallback } from 'react'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import {
  SearchFilter,
  Span,
  Trace,
  TraceWithSpans,
} from '@latitude-data/core/browser'
import { reverse, sortBy } from 'lodash-es'
import { ListTracesResponse } from '@latitude-data/core/services/traces/list'

export function useRealtimeTraces({
  page,
  pageSize,
  filters,
  fallbackData,
}: {
  page: number
  pageSize: number
  filters: SearchFilter[]
  fallbackData: ListTracesResponse
}) {
  const { mutate } = useTracesPagination(
    {
      page: Number(page),
      pageSize: Number(pageSize),
      filters,
    },
    {
      fallbackData,
    },
  )

  const onMessage = useCallback(
    (args: EventArgs<'tracesAndSpansCreated'>) => {
      const { traces, spans } = args

      // group spans by trace
      const spansByTrace = traces.map((t: Trace) => {
        const sps = spans.filter((s: Span) => s.traceId === t.traceId)
        return { ...t, spans: sps } as TraceWithSpans
      })

      mutate(
        (data: ListTracesResponse) => {
          let newData = [...(data?.items || [])]

          spansByTrace.forEach((trace: TraceWithSpans) => {
            const i = newData.findIndex((t) => t.traceId === trace.traceId)

            if (i > -1) {
              const existing = newData[i]!
              spans.forEach((span) => {
                const index = existing.spans.findIndex(
                  (s) => s.spanId === span.spanId,
                )
                if (index !== -1) {
                  existing.spans[index] = span
                } else {
                  existing.spans.push(span)
                }
              })
              existing.realtimeAdded = true
            } else {
              newData.push(serializeTrace({ ...trace, realtimeAdded: true }))
            }
          })

          newData = reverse(sortBy(newData, (t) => t.startTime))

          if (!data) {
            return {
              items: newData,
              count: newData.length,
              page,
              pageSize,
            }
          } else {
            return {
              ...data,
              items: newData,
            }
          }
        },
        { revalidate: false },
      )
    },
    [mutate],
  )

  useSockets({ event: 'tracesAndSpansCreated', onMessage })
}
