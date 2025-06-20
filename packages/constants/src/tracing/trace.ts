import { z } from 'zod'
import { Segment, SegmentBaggage, SegmentType } from './segment'
import { Span, SpanType } from './span'

// Note: Traces are unmaterialized but this context is used to propagate the trace
// See www.w3.org/TR/trace-context and w3c.github.io/baggage
export const traceContextSchema = z.object({
  traceparent: z.string(), // <version>-<trace-id>-<span-id>-<trace-flags>
  tracestate: z.string().optional(), // <key>=urlencoded(<value>)[,<key>=urlencoded(<value>)]*
  baggage: z.string().optional(), // <key>=urlencoded(<value>)[,<key>=urlencoded(<value>)]*
})
export type TraceContext = z.infer<typeof traceContextSchema>

export type TraceBaggage = {
  segment: Pick<SegmentBaggage, 'id' | 'parentId'> // Note: helper for third-party observability services
  segments: SegmentBaggage[]
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
