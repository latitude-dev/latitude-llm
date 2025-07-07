import {
  AssembledSpan,
  Span,
  SpanSpecification,
  SpanType,
  SpanWithDetails,
} from '@latitude-data/core/browser'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { TextColor } from '@latitude-data/web-ui/tokens'
import React from 'react'
import CompletionSpanSpecification from './Completion'
import EmbeddingSpanSpecification from './Embedding'
import HttpSpanSpecification from './Http'
import RerankingSpanSpecification from './Reranking'
import RetrievalSpanSpecification from './Retrieval'
import SegmentSpanSpecification from './Segment'
import ToolSpanSpecification from './Tool'
import UnknownSpanSpecification from './Unknown'

export type TimelineItemProps<T extends SpanType = SpanType> = {
  span: AssembledSpan<T>
  isFirst: boolean
  isLast: boolean
  isSelected: boolean
}

export type DetailsPanelProps<T extends SpanType = SpanType> = {
  span: SpanWithDetails<T>
}

export type SpanFrontendSpecification<T extends SpanType = SpanType> =
  SpanSpecification<T> & {
    icon: IconName
    color: TextColor
    TimelineTreeItem: (props: TimelineItemProps<T>) => React.ReactNode
    TimelineGraphItem: (props: TimelineItemProps<T>) => React.ReactNode
    DetailsPanel: (props: DetailsPanelProps<T>) => React.ReactNode
  }

// prettier-ignore
export const SPAN_SPECIFICATIONS: {
  [T in SpanType]: SpanFrontendSpecification<T>
} = {
  [SpanType.Tool]: ToolSpanSpecification,
  [SpanType.Completion]: CompletionSpanSpecification,
  [SpanType.Embedding]: EmbeddingSpanSpecification,
  [SpanType.Retrieval]: RetrievalSpanSpecification,
  [SpanType.Reranking]: RerankingSpanSpecification,
  [SpanType.Http]: HttpSpanSpecification,
  [SpanType.Segment]: SegmentSpanSpecification,
  [SpanType.Unknown]: UnknownSpanSpecification,
}

export function getSpanSpecification<T extends SpanType = SpanType>(
  span: Span<T>,
) {
  return SPAN_SPECIFICATIONS[span.type]
}
