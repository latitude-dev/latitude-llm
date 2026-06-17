import { type ChSqlClient, generateId, type OrganizationId, type ProjectId, type RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import type { DestinationKind } from "../entities/destination.ts"
import type { DestinationEvent } from "../entities/destination-event.ts"
import type { DestinationSource, DestinationSourceConfig } from "../entities/destination-source.ts"
import { DestinationMappers } from "../ports/destination-mapper.ts"
import { DestinationSourceReaders } from "../ports/destination-source-reader.ts"

export interface PreviewDestinationDeliveryInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly kind: DestinationKind
  readonly source: DestinationSource
  readonly sourceConfig: DestinationSourceConfig
  /** How many recent records to sample and map; defaults to 1. */
  readonly sampleSize?: number
}

export interface PreviewDestinationDeliveryResult {
  /** False when the source has no records yet — the UI shows "No data yet". */
  readonly hasData: boolean
  readonly recordsSampled: number
  readonly events: readonly DestinationEvent[]
}

/**
 * Read-only "what gets sent" preview: samples the source's latest records, maps
 * them with the `(kind, source)` mapper under the given per-source config, and
 * returns the resulting events. No delivery, no upstream call, no cursor move.
 * The event UUIDs use a throwaway destination id — preview output is for display,
 * never delivered.
 */
export const previewDestinationDeliveryUseCase = (input: PreviewDestinationDeliveryInput) =>
  Effect.gen(function* () {
    const readers = yield* DestinationSourceReaders
    const records = yield* readers[input.source].sampleLatest({
      organizationId: input.organizationId,
      projectId: input.projectId,
      limit: input.sampleSize ?? 1,
    })
    if (records.length === 0) {
      return { hasData: false, recordsSampled: 0, events: [] } satisfies PreviewDestinationDeliveryResult
    }

    const mappers = yield* DestinationMappers
    const mapper = mappers[input.kind][input.source]
    if (!mapper) {
      return { hasData: true, recordsSampled: records.length, events: [] } satisfies PreviewDestinationDeliveryResult
    }

    const mapped = yield* mapper.toEvents(records, generateId<"DestinationId">(), input.sourceConfig)
    return {
      hasData: true,
      recordsSampled: records.length,
      events: mapped.events,
    } satisfies PreviewDestinationDeliveryResult
  }).pipe(Effect.withSpan("destinations.previewDestinationDelivery")) as Effect.Effect<
    PreviewDestinationDeliveryResult,
    RepositoryError,
    ChSqlClient | DestinationSourceReaders | DestinationMappers
  >
