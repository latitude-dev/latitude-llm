import { AssembledSpan, SpanType } from '@latitude-data/core/browser'

export type TimelineItemProps<T extends SpanType = SpanType> = {
  span: AssembledSpan<T>
  isFirst: boolean
  isLast: boolean
  isSelected: boolean
  isParentSelected: boolean
}
