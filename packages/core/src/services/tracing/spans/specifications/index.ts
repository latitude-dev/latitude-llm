import { Span, SpanType } from '../../../../constants'
import { ChatSpanSpecification } from './chat'
import { CompletionSpanSpecification } from './completion'
import { EmbeddingSpanSpecification } from './embedding'
import { ExternalSpanSpecification } from './external'
import { HttpSpanSpecification } from './http'
import { PromptSpanSpecification } from './prompt'
import { SpanBackendSpecification } from '../shared'
import { ToolSpanSpecification } from './tool'
import { UnknownSpanSpecification } from './unknown'
import { UnresolvedExternalSpanSpecification } from './unresolvedExternal'

export const SPAN_SPECIFICATIONS: {
  [T in SpanType]: SpanBackendSpecification<T>
} = {
  [SpanType.Prompt]: PromptSpanSpecification,
  [SpanType.Chat]: ChatSpanSpecification,
  [SpanType.External]: ExternalSpanSpecification,
  [SpanType.UnresolvedExternal]: UnresolvedExternalSpanSpecification,

  [SpanType.Completion]: CompletionSpanSpecification,
  [SpanType.Embedding]: EmbeddingSpanSpecification,
  [SpanType.Tool]: ToolSpanSpecification,

  [SpanType.Http]: HttpSpanSpecification,
  [SpanType.Unknown]: UnknownSpanSpecification,
}

export function getSpanSpecification<T extends SpanType = SpanType>(
  span: Span<T>,
) {
  return SPAN_SPECIFICATIONS[span.type]
}
