import {
  Span,
  SpanSpecification,
  SpanType,
  SpanWithDetails,
} from '@latitude-data/core/browser'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import React from 'react'

export type TimelineItemProps<T extends SpanType = SpanType> = {
  span: Span<T>
}

export type DetailsPanelProps<T extends SpanType = SpanType> = {
  span: SpanWithDetails<T>
}

export type SpanFrontendSpecification<T extends SpanType = SpanType> =
  SpanSpecification<T> & {
    icon: IconName
    TimelineItem: (props: TimelineItemProps<T>) => React.ReactNode
    DetailsPanel: (props: DetailsPanelProps<T>) => React.ReactNode
  }

// prettier-ignore
export const SPAN_SPECIFICATIONS: {
  [T in SpanType]: SpanFrontendSpecification<T>
} = {
  [SpanType.Tool]: undefined as any, // TODO(tracing): implement
  [SpanType.Completion]: undefined as any, // TODO(tracing): implement
  [SpanType.Embedding]: undefined as any, // TODO(tracing): implement
  [SpanType.Retrieval]: undefined as any, // TODO(tracing): implement
  [SpanType.Reranking]: undefined as any, // TODO(tracing): implement
  [SpanType.Http]: undefined as any, // TODO(tracing): implement
  [SpanType.Segment]: undefined as any, // TODO(tracing): implement
  [SpanType.Unknown]: undefined as any, // TODO(tracing): implement
}

export function getSpanSpecification<T extends SpanType = SpanType>(
  span: Span<T>,
) {
  return SPAN_SPECIFICATIONS[span.type]
}
