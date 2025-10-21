import { z } from 'zod'
import { Span, SpanType } from './span'

// Note: Traces are unmaterialized but this context is used to propagate the trace
// See www.w3.org/TR/trace-context and w3c.github.io/baggage
export const traceContextSchema = z.object({
  traceparent: z.string(), // <version>-<trace-id>-<span-id>-<trace-flags>
  tracestate: z.string().optional(), // <key>=urlencoded(<value>)[,<key>=urlencoded(<value>)]*
  baggage: z.string().optional(), // <key>=urlencoded(<value>)[,<key>=urlencoded(<value>)]*
})
export type TraceContext = z.infer<typeof traceContextSchema>

export type AssembledSpan<T extends SpanType = SpanType> = Span<T> & {
  conversationId?: string
  children: AssembledSpan[]
  depth: number
  startOffset: number
  endOffset: number
}

// Note: full trace structure ready to be drawn, parts are ordered by timestamp
export type AssembledTrace = {
  id: string
  conversationId?: string
  children: AssembledSpan[]
  spans: number
  duration: number
  startedAt: Date
  endedAt: Date
}

export const TRACE_CACHE_TTL = 5 * 60 // 5 minutes
