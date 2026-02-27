import { DetailsPanel } from '$/components/tracing/spans/DetailsPanel'
import { AssembledTrace, isMainSpan } from '@latitude-data/constants'

export function TraceDetailCard({
  trace,
  collapsible,
  defaultExpanded,
}: {
  trace: AssembledTrace
  collapsible: boolean
  defaultExpanded: boolean
}) {
  const mainSpan = trace.children.find((s) => isMainSpan(s))
  const span = mainSpan ?? trace.children[0]
  if (!span) return null

  return (
    <DetailsPanel
      span={span}
      documentLogUuid={span.documentLogUuid}
      collapsible={collapsible}
      defaultExpanded={defaultExpanded}
    />
  )
}
