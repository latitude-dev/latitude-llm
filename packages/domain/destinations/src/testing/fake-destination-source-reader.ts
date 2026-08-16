import type { SpanDetail } from "@domain/spans"
import { Effect } from "effect"
import type { DestinationSource } from "../entities/destination-source.ts"
import type {
  DestinationSourceReader,
  DestinationSourceReaderRegistry,
  SourceCursor,
  SourceWindow,
} from "../ports/destination-source-reader.ts"

export interface FakeSourceWindowInput {
  readonly cursor: SourceCursor
  readonly windowEnd: Date
  readonly limit: number
}

/**
 * In-memory DestinationSourceReader. `windowFor` lets a test return whatever
 * window it needs for the cursor/limit it sees; the default reads from a fixed
 * record list ordered by `(ingestedAt, spanId, traceId)` strictly after the cursor.
 */
export const createFakeDestinationSourceReader = (
  windowFor: (input: FakeSourceWindowInput) => SourceWindow<SpanDetail>,
  sample: readonly SpanDetail[] = [],
  recentLimitFloor: SourceCursor | null = null,
): DestinationSourceReader<SpanDetail> => ({
  listWindow: ({ cursor, windowEnd, limit }) => Effect.succeed(windowFor({ cursor, windowEnd, limit })),
  sampleLatest: ({ limit }) => Effect.succeed(sample.slice(0, limit)),
  recentLimitFloor: () => Effect.succeed(recentLimitFloor),
})

/** Wraps a single reader into a registry; v1 has only the `spans` source. */
export const fakeSourceReaderRegistry = (
  recordsReader: DestinationSourceReader<SpanDetail>,
): DestinationSourceReaderRegistry => ({
  spans: recordsReader,
})

/** Convenience: a reader that always returns the given records + nextCursor regardless of input. */
export const staticSourceReader = (window: {
  records: readonly SpanDetail[]
  nextCursor: SourceCursor | null
  recentLimitFloor?: SourceCursor | null
}): DestinationSourceReader<SpanDetail> =>
  createFakeDestinationSourceReader(() => window, window.records, window.recentLimitFloor ?? null)

export const SPANS_SOURCE: DestinationSource = "spans"
