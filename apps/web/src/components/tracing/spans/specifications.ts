import ChatSpanSpecification from './Chat'
import CompletionSpanSpecification from './Completion'
import EmbeddingSpanSpecification from './Embedding'
import ExternalSpanSpecification from './External'
import HttpSpanSpecification from './Http'
import RerankingSpanSpecification from './Reranking'
import RetrievalSpanSpecification from './Retrieval'
import ToolSpanSpecification from './Tool'
import PromptSpanSpecification from './Prompt'
import UnknownSpanSpecification from './Unknown'
import { SpanFrontendSpecification } from './shared'
import { Span, SpanType } from '@latitude-data/core/constants'

// prettier-ignore
export const SPAN_SPECIFICATIONS: {
  [T in SpanType]: SpanFrontendSpecification<T>
} = {
  [SpanType.Completion]: CompletionSpanSpecification,
  [SpanType.Embedding]: EmbeddingSpanSpecification,
  [SpanType.Http]: HttpSpanSpecification,
  [SpanType.Prompt]: PromptSpanSpecification,
  [SpanType.Chat]: ChatSpanSpecification,
  [SpanType.External]: ExternalSpanSpecification,
  //@ts-expect-error - Not really possible to display in the UI, as this type is never stored
  [SpanType.UnresolvedExternal]: ExternalSpanSpecification,
  [SpanType.Reranking]: RerankingSpanSpecification,
  [SpanType.Retrieval]: RetrievalSpanSpecification,
  [SpanType.Step]: UnknownSpanSpecification,
  [SpanType.Tool]: ToolSpanSpecification,
  [SpanType.Unknown]: UnknownSpanSpecification,
}

export function getSpanSpecification<T extends SpanType = SpanType>(
  span: Span<T>,
) {
  return SPAN_SPECIFICATIONS[span.type]
}
