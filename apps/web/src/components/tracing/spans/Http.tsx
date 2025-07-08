import { SPAN_SPECIFICATIONS, SpanType } from '@latitude-data/core/browser'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { DetailsPanelProps, SPAN_COLORS } from './shared'

// TODO(tracing): implement

const specification = SPAN_SPECIFICATIONS[SpanType.Http]
export default {
  ...specification,
  icon: 'globe' as IconName,
  color: SPAN_COLORS.yellow,
  DetailsPanel: DetailsPanel,
}

function DetailsPanel({ span }: DetailsPanelProps<SpanType.Http>) {
  return <div>DetailsPanel</div>
}
