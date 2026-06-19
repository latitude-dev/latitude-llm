import { SpanId } from "@domain/shared"
import { type SpanDetail, SpanRepository, type SpanRepositoryShape } from "@domain/spans"
import { Effect, Layer } from "effect"
import { type DestinationSourceReader, DestinationSourceReaders } from "../ports/destination-source-reader.ts"

/**
 * Spans source adapter: maps the `SpanRepository` window read onto the
 * `DestinationSourceReader` port (cursor `(watermark, id)` ⇄ spans
 * `(ingested_at, span_id)`). The v1 spans binding lives here next to the
 * spans→PostHog mapper; the source-agnostic engine never references it directly.
 */
export const createSpansSourceReader = (spanRepo: SpanRepositoryShape): DestinationSourceReader<SpanDetail> => ({
  listWindow: ({ organizationId, projectId, cursor, windowEnd, limit }) =>
    spanRepo
      .listByIngestedAtWindow({
        organizationId,
        projectId,
        cursor: { ingestedAt: cursor.watermark, spanId: SpanId(cursor.id) },
        windowEnd,
        limit,
      })
      .pipe(
        Effect.map((window) => ({
          records: window.spans,
          nextCursor: window.nextCursor
            ? { watermark: window.nextCursor.ingestedAt, id: window.nextCursor.spanId }
            : null,
        })),
      ),
  sampleLatest: ({ organizationId, projectId, limit }) =>
    spanRepo.listRecentDetailsByProjectId({ organizationId, projectId, limit }),
  recentLimitFloor: ({ organizationId, projectId, end, limit }) =>
    spanRepo.findIngestedAtFloorForRecentLimit({ organizationId, projectId, windowEnd: end, limit }),
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
