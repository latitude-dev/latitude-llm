import { SpanType } from '@latitude-data/core/browser'
import { DetailsPanelProps, SPAN_SPECIFICATIONS } from './index'

// TODO(tracing): implement

export function DetailsPanel<T extends SpanType>({
  span,
}: DetailsPanelProps<T>) {
  const specification = SPAN_SPECIFICATIONS[span.type]
  if (!specification) return null

  return <div>DetailsPanel</div>
}
