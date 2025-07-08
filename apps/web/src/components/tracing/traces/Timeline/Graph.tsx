import { AssembledSpan, AssembledTrace } from '@latitude-data/core/browser'
// import { TimelineItemProps } from './shared'
// import { SPAN_SPECIFICATIONS } from '../../spans/specifications'

export function TimelineGraph({
  trace,
  selectedSpan,
  setSelectedSpan,
}: {
  trace: AssembledTrace
  selectedSpan?: AssembledSpan
  setSelectedSpan: (span?: AssembledSpan) => void
}) {
  return <div>timeline graph (selected: {selectedSpan?.name || 'none'})</div>
}
