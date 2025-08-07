import { SpanType } from '@latitude-data/core/browser'
import CompletionSpanSpecification from './Completion'
import EmbeddingSpanSpecification from './Embedding'
import HttpSpanSpecification from './Http'
import RerankingSpanSpecification from './Reranking'
import RetrievalSpanSpecification from './Retrieval'
import SegmentSpanSpecification from './Segment'
import ToolSpanSpecification from './Tool'
import UnknownSpanSpecification from './Unknown'
import type { SpanFrontendSpecification } from './shared'

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
