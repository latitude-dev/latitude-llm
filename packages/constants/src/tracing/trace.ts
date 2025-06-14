import { Segment, SegmentType } from './segment'
import { Span, SpanType } from './span'

// Note: Traces are unmaterialized but this context is used to propagate the trace, see https://www.w3.org/TR/trace-context/
export type TraceContext = {
  traceparent: string
  tracestate?: string
  baggage: string
}

export type AssembledSpan<T extends SpanType = SpanType> = Span<T> & {
  class: 'span'
  parts: AssembledSpan[]
}

export type AssembledSegment<T extends SegmentType = SegmentType> =
  Segment<T> & {
    class: 'segment'
    parts: (AssembledSegment | AssembledSpan)[]
  }

// Note: full trace structure ready to be drawn, parts are ordered by timestamp
export type AssembledTrace = {
  id: string
  parts: (AssembledSegment | AssembledSpan)[]
}
