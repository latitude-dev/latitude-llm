import { Span, SpanType } from '../../../browser'
import { CompletionSpanSpecification } from './completion'
import { EmbeddingSpanSpecification } from './embedding'
import { HttpSpanSpecification } from './http'
import { RerankingSpanSpecification } from './reranking'
import { RetrievalSpanSpecification } from './retrieval'
import { SegmentSpanSpecification } from './segment'
import { SpanBackendSpecification } from './shared'
import { ToolSpanSpecification } from './tool'
import { UnknownSpanSpecification } from './unknown'

// prettier-ignore
export const SPAN_SPECIFICATIONS: {
  [T in SpanType]: SpanBackendSpecification<T>
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
