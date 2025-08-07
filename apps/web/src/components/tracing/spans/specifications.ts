import { SpanType } from '@latitude-data/core/browser'
import CompletionSpanSpecification from './Completion'
import EmbeddingSpanSpecification from './Embedding'
import HttpSpanSpecification from './Http'
import RerankingSpanSpecification from './Reranking'
import RetrievalSpanSpecification from './Retrieval'
import ToolSpanSpecification from './Tool'
import PromptSpanSpecification from './Prompt'
import UnknownSpanSpecification from './Unknown'
import type { SpanFrontendSpecification } from './shared'

export const SPAN_SPECIFICATIONS: {
  [T in SpanType]: SpanFrontendSpecification<T>
} = {
  [SpanType.Completion]: CompletionSpanSpecification,
  [SpanType.Embedding]: EmbeddingSpanSpecification,
  [SpanType.Http]: HttpSpanSpecification,
  [SpanType.Prompt]: PromptSpanSpecification,
  [SpanType.Reranking]: RerankingSpanSpecification,
  [SpanType.Retrieval]: RetrievalSpanSpecification,
  [SpanType.Step]: UnknownSpanSpecification,
  [SpanType.Tool]: ToolSpanSpecification,
  [SpanType.Unknown]: UnknownSpanSpecification,
}
