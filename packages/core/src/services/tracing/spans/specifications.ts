import { Span, SpanType } from '../../../browser'
import { SpanBackendSpecification } from './shared'

export const SPAN_SPECIFICATIONS: {
  [T in SpanType]: SpanBackendSpecification<T>
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
