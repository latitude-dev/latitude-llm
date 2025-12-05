import { Span } from '@latitude-data/constants'

export function serializeSpans(spans: Span[]) {
  return spans.map((span) => ({
    ...span,
    startedAt: new Date(span.startedAt),
  }))
}
