import type { DestinationId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { DestinationKind } from "../entities/destination.ts"
import type { DestinationEvent } from "../entities/destination-event.ts"
import type { DestinationSource, DestinationSourceConfig } from "../entities/destination-source.ts"
import type { SourceRecordTypes } from "./destination-source-reader.ts"

export interface MappedEvents {
  readonly events: readonly DestinationEvent[]
  /** Events dropped by the mapper's oversized-event policy, counted into `events_dropped`. */
  readonly dropped: number
}

/**
 * Pure mapper for one `(source, kind)` pair: turns a window of the source's
 * records into the kind's events. Generic over the source record type (like
 * {@link DestinationSourceReader}) so a mapper that still expects spans surfaces
 * as a compile error when wired under another source. `destinationId` seeds the
 * deterministic event identity; `sourceConfig` carries the per-source delivery
 * settings (payload exclusion, etc.).
 */
export interface DestinationMapper<TRecord> {
  toEvents(
    records: readonly TRecord[],
    destinationId: DestinationId,
    sourceConfig: DestinationSourceConfig,
  ): Effect.Effect<MappedEvents>
}

/**
 * Per-`(kind, source)` mapper registry. A kind only carries mappers for the
 * sources it supports (`DESTINATION_KIND_META[kind].supportedSources`), so the
 * inner map is partial; the engine treats a missing entry as a wiring error.
 */
export type DestinationMapperRegistry = {
  readonly [K in DestinationKind]: Partial<{
    readonly [S in DestinationSource]: DestinationMapper<SourceRecordTypes[S]>
  }>
}

export class DestinationMappers extends Context.Service<DestinationMappers, DestinationMapperRegistry>()(
  "@domain/destinations/DestinationMappers",
) {}
