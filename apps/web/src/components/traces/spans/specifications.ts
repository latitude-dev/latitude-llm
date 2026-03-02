import ChatSpanSpecification from './Chat'
import CompletionSpanSpecification from './Completion'
import EmbeddingSpanSpecification from './Embedding'
import ExternalSpanSpecification from './External'
import HttpSpanSpecification from './Http'
import ToolSpanSpecification from './Tool'
import PromptSpanSpecification from './Prompt'
import UnknownSpanSpecification from './Unknown'
import { SpanFrontendSpecification } from './shared'
import { SpanType } from '@latitude-data/core/constants'

// prettier-ignore
export const SPAN_SPECIFICATIONS: {
  [T in SpanType]: SpanFrontendSpecification<T>
} = {
  [SpanType.Prompt]: PromptSpanSpecification,
  [SpanType.Chat]: ChatSpanSpecification,
  [SpanType.External]: ExternalSpanSpecification,
  [SpanType.UnresolvedExternal]: UnknownSpanSpecification,

  [SpanType.Completion]: CompletionSpanSpecification,
  [SpanType.Embedding]: EmbeddingSpanSpecification,
  [SpanType.Tool]: ToolSpanSpecification,

  [SpanType.Http]: HttpSpanSpecification,
  
  [SpanType.Unknown]: UnknownSpanSpecification,
}
