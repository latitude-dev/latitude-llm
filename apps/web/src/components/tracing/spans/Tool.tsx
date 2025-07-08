import { SPAN_SPECIFICATIONS, SpanType } from '@latitude-data/core/browser'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { DetailsPanelProps, SPAN_COLORS } from './shared'

// TODO(tracing): implement

const specification = SPAN_SPECIFICATIONS[SpanType.Tool]
export default {
  ...specification,
  icon: 'blocks' as IconName,
  color: SPAN_COLORS.green,
  DetailsPanel: DetailsPanel,
}

function DetailsPanel({ span }: DetailsPanelProps<SpanType.Tool>) {
  return <div>DetailsPanel</div>
}
