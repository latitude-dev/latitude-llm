import { Span, SpanType } from '../../../constants'
import { ChatSpanSpecification } from './chat'
import { CompletionSpanSpecification } from './completion'
import { EmbeddingSpanSpecification } from './embedding'
import { ExternalSpanSpecification } from './external'
import { HttpSpanSpecification } from './http'
import { PromptSpanSpecification } from './prompt'
import { RerankingSpanSpecification } from './reranking'
import { RetrievalSpanSpecification } from './retrieval'
import { SpanBackendSpecification } from './shared'
import { StepSpanSpecification } from './step'
import { ToolSpanSpecification } from './tool'
import { UnknownSpanSpecification } from './unknown'
import { UnresolvedExternalSpanSpecification } from './unresolvedExternal'

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
  [SpanType.Prompt]: PromptSpanSpecification,
  [SpanType.Chat]: ChatSpanSpecification,
  [SpanType.External]: ExternalSpanSpecification,
  [SpanType.UnresolvedExternal]: UnresolvedExternalSpanSpecification,
  [SpanType.Step]: StepSpanSpecification,
  [SpanType.Unknown]: UnknownSpanSpecification,
}

export function getSpanSpecification<T extends SpanType = SpanType>(
  span: Span<T>,
) {
  return SPAN_SPECIFICATIONS[span.type]
}
