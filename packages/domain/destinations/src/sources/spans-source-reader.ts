import { SpanId, TraceId } from "@domain/shared"
import { type SpanDetail, type SpanIngestionCursor, SpanRepository, type SpanRepositoryShape } from "@domain/spans"
import { Effect, Layer } from "effect"
import {
  type DestinationSourceReader,
  DestinationSourceReaders,
  type SourceCursor,
} from "../ports/destination-source-reader.ts"

const toSourceCursor = (cursor: SpanIngestionCursor | null): SourceCursor | null =>
  cursor
    ? {
        watermark: cursor.ingestedAt,
        id: cursor.spanId,
        traceId: cursor.traceId,
      }
    : null

/**
 * Spans source adapter: maps the `SpanRepository` window read onto the
 * `DestinationSourceReader` port (cursor `(watermark, id, traceId)` ⇄ spans
 * `(ingested_at, span_id, trace_id)`). The v1 spans binding lives here next to the
 * spans→PostHog mapper; the source-agnostic engine never references it directly.
 */
export const createSpansSourceReader = (spanRepo: SpanRepositoryShape): DestinationSourceReader<SpanDetail> => ({
  listWindow: ({ organizationId, projectId, cursor, windowEnd, limit, excludePayloads }) =>
    spanRepo
      .listByIngestedAtWindow({
        organizationId,
        projectId,
        cursor: {
          ingestedAt: cursor.watermark,
          spanId: SpanId(cursor.id),
          traceId: TraceId(cursor.traceId ?? ""),
        },
        windowEnd,
        limit,
        excludePayloads: excludePayloads ?? false,
      })
      .pipe(
        Effect.map((window) => ({
          records: window.spans,
          nextCursor: toSourceCursor(window.nextCursor),
        })),
      ),
  sampleLatest: ({ organizationId, projectId, limit }) =>
    spanRepo.listRecentDetailsByProjectId({ organizationId, projectId, limit }),
  recentLimitFloor: ({ organizationId, projectId, end, limit }) =>
    spanRepo
      .findIngestedAtFloorForRecentLimit({ organizationId, projectId, windowEnd: end, limit })
      .pipe(Effect.map(toSourceCursor)),
})

/**
 * `DestinationSourceReaders` registry for v1 — the `spans` source only. Requires
 * `SpanRepository`; provide the concrete `SpanRepositoryLive` at the composition
 * root. When a second source is added, compose its reader into this registry.
 */
export const SpansSourceReadersLive = Layer.effect(
  DestinationSourceReaders,
  Effect.gen(function* () {
    const spanRepo = yield* SpanRepository
    return { spans: createSpansSourceReader(spanRepo) }
  }),
)
