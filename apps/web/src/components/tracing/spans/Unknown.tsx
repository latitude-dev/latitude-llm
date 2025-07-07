import { SPAN_SPECIFICATIONS, SpanType } from '@latitude-data/core/browser'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { DetailsPanelProps, TimelineItemProps } from './index'

// TODO(tracing): implement

const specification = SPAN_SPECIFICATIONS[SpanType.Unknown]
export default {
  ...specification,
  icon: 'rectangleHorizontal' as IconName,
  color: 'foreground' as TextColor,
  TimelineTreeItem: TimelineTreeItem,
  TimelineGraphItem: TimelineGraphItem,
  DetailsPanel: DetailsPanel,
}

function TimelineTreeItem({ span }: TimelineItemProps<SpanType.Unknown>) {
  return <div>TimelineTreeItem</div>
}

function TimelineGraphItem({ span }: TimelineItemProps<SpanType.Unknown>) {
  return <div>TimelineGraphItem</div>
}

function DetailsPanel({ span }: DetailsPanelProps<SpanType.Unknown>) {
  return <div>DetailsPanel</div>
}
