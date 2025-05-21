import { Segment, SegmentType } from './segment'
import { Span, SpanType } from './span'

// Note: Traces are unmaterialized

/* Note: full trace structure ready to be drawn, parts are ordered by timestamp */

export type FullSpan<T extends SpanType = SpanType> = Span<T> & {
  parts: FullSpan[]
}

export type FullSegment<T extends SegmentType = SegmentType> = Segment<T> & {
  parts: (FullSegment | FullSpan)[]
}

export type FullTrace = {
  id: string
  parts: (FullSegment | FullSpan)[]
}
