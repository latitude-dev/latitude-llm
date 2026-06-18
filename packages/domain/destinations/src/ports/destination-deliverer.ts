import type { Effect } from "effect"
import { Context } from "effect"
import type { DestinationConfig, DestinationCredentials, DestinationKind } from "../entities/destination.ts"
import type { DestinationEvent } from "../entities/destination-event.ts"
import type { DeliveryError } from "../errors.ts"

export interface DeliveryWindow {
  readonly start: Date
  readonly end: Date
}

/**
 * Destination-agnostic delivery facts the engine already knows. Adapters
 * derive their own vendor mechanics from it — e.g. PostHog flags windows
 * ending more than 48h ago as `historical_migration` — so the engine never
 * knows the words "historical" or "backfill".
 */
export interface DeliveryContext {
  readonly window: DeliveryWindow
}

export interface DeliveryResult {
  readonly delivered: number
  /** Events the adapter dropped at its own per-event size guard, counted into `events_dropped`. */
  readonly dropped: number
}

export interface DestinationDeliverer {
  /**
   * Coarse age (ms) past which this destination needs distinct
   * historical-ingestion semantics. Surfaced to the backfill scheduler so it
   * never builds a window straddling `now − historicalBoundaryMs` — each
   * delivered window lands cleanly on one side, since the adapter still derives
   * its own per-window flag from `context.window`. PostHog returns its 48h rule;
   * a destination with no special mechanism leaves this `undefined`, and backfill
   * chunks for size only. The boundary value lives in the adapter — the engine
   * reads it generically and never hardcodes it.
   */
  readonly historicalBoundaryMs?: number
  deliver(
    events: readonly DestinationEvent[],
    config: DestinationConfig,
    credentials: DestinationCredentials,
    context: DeliveryContext,
  ): Effect.Effect<DeliveryResult, DeliveryError>
  testConnection(config: DestinationConfig, credentials: DestinationCredentials): Effect.Effect<void, DeliveryError>
}

/** Exhaustive per-kind adapter registry, TS-enforced like the Slack notification renderer registry. */
export type DestinationDelivererRegistry = Record<DestinationKind, DestinationDeliverer>

export class DestinationDeliverers extends Context.Service<DestinationDeliverers, DestinationDelivererRegistry>()(
  "@domain/destinations/DestinationDeliverers",
) {}
