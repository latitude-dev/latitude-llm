import type { SpanDetail } from "@domain/spans"
import { Context, type Effect } from "effect"
import type { Destination, DestinationKind } from "../entities/destination.ts"
import type { DestinationEvent } from "../entities/destination-event.ts"

export interface MappedEvents {
  readonly events: readonly DestinationEvent[]
  /** Events dropped by the mapper's oversized-event policy, counted into `events_dropped`. */
  readonly dropped: number
}

/** Per-kind pure span→event mapper. The engine maps a window's spans without knowing any vendor schema. */
export interface DestinationMapper {
  toEvents(spans: readonly SpanDetail[], destination: Destination): Effect.Effect<MappedEvents>
}

/** Exhaustive per-kind mapper registry, TS-enforced like {@link DestinationDelivererRegistry}. */
export type DestinationMapperRegistry = Record<DestinationKind, DestinationMapper>

export class DestinationMappers extends Context.Service<DestinationMappers, DestinationMapperRegistry>()(
  "@domain/destinations/DestinationMappers",
) {}
