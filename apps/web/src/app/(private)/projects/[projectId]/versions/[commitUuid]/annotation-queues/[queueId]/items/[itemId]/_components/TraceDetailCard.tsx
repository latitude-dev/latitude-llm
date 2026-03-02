'use client'

import { DetailsPanel } from '$/components/tracing/spans/DetailsPanel'
import { useSpanByTraceId } from '$/stores/spans'
import { AssembledTrace } from '@latitude-data/constants'

export function TraceDetailCard({
  trace,
  collapsible,
}: {
  trace: AssembledTrace
  collapsible: boolean
}) {
  const rootSpan = trace.children[0]
  const { data: span } = useSpanByTraceId({
    traceId: rootSpan?.traceId,
    spanId: rootSpan?.id,
  })
  if (!span) return null

  return (
    <DetailsPanel
      span={span}
      documentLogUuid={span.documentLogUuid}
      collapsible={collapsible}
    />
  )
}
