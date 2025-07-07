import { SPAN_SPECIFICATIONS, SpanType } from '@latitude-data/core/browser'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { DetailsPanelProps, TimelineItemProps } from './index'

// TODO(tracing): implement

const specification = SPAN_SPECIFICATIONS[SpanType.Tool]
export default {
  ...specification,
  icon: 'blocks' as IconName,
  color: 'foreground' as TextColor,
  TimelineTreeItem: TimelineTreeItem,
  TimelineGraphItem: TimelineGraphItem,
  DetailsPanel: DetailsPanel,
}

function TimelineTreeItem({ span }: TimelineItemProps<SpanType.Tool>) {
  return <div>TimelineTreeItem</div>
}

function TimelineGraphItem({ span }: TimelineItemProps<SpanType.Tool>) {
  return <div>TimelineGraphItem</div>
}

function DetailsPanel({ span }: DetailsPanelProps<SpanType.Tool>) {
  return <div>DetailsPanel</div>
}
