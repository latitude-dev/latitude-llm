import type { SpanDetail } from "@domain/spans"
import { Effect } from "effect"
import type { DestinationEvent } from "../entities/destination-event.ts"
import type { DestinationMapper } from "../ports/destination-mapper.ts"

/**
 * Minimal in-memory mapper: one event per span (engine tests assert on counts
 * and cursor movement, not vendor schema). `dropped` is configurable so the
 * `events_dropped` accounting can be exercised.
 */
export const createFakeDestinationMapper = (opts: { dropped?: number } = {}) => {
  const mapped: SpanDetail[][] = []

  const mapper: DestinationMapper<SpanDetail> = {
    toEvents: (spans) =>
      Effect.sync(() => {
        mapped.push([...spans])
        const events: DestinationEvent[] = spans.map((span) => ({
          uuid: `${span.spanId}:event`,
          name: "$ai_span",
          distinctId: span.traceId,
          timestamp: span.endTime,
          sourceRecordId: `${span.traceId}:${span.spanId}`,
          properties: {},
        }))
        return { events, dropped: opts.dropped ?? 0 }
      }),
  }

  return { mapper, mapped }
}
