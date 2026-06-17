import { DESTINATION_LAG_WARNING_MS } from "./constants.ts"
import type { DestinationStatus } from "./entities/destination.ts"
import type { DestinationSyncRunStatus } from "./entities/destination-sync-run.ts"

/**
 * Customer-facing health for a destination card. Read-only — derived from the
 * destination status, its server-computed freshness, and the latest sync run;
 * never stored. `lagging` is a soft warning layered over an otherwise-active
 * destination; `quarantined`/`paused` always win (a paused destination isn't
 * "lagging", it's stopped on purpose).
 */
export type DestinationHealthBadge = "healthy" | "lagging" | "quarantined" | "paused"

export interface DestinationHealth {
  readonly badge: DestinationHealthBadge
  /** Freshness from {@link getDestinationFreshnessUseCase}: worst undelivered-backlog lag across enabled sources; null = caught up. */
  readonly lagMs: number | null
  readonly lastRunStatus: DestinationSyncRunStatus | null
  /** events_dropped on the latest run (oversized-event policy). */
  readonly eventsDropped: number
}

export interface DeriveDestinationHealthInput {
  readonly status: DestinationStatus
  /**
   * Per-enabled-source freshness from {@link getDestinationFreshnessUseCase}: each
   * `lagMs` is `now − oldest undelivered record` for that source, or null = caught
   * up. The headline lag is the worst across them (null only if all caught up).
   * Must be undelivered-backlog lag, NOT raw `now − watermark` — an idle source's
   * watermark trails real time purely from idle-backoff and would read as "behind"
   * with nothing to deliver.
   */
  readonly sources: ReadonlyArray<{ readonly lagMs: number | null }>
  readonly latestRun: { readonly status: DestinationSyncRunStatus; readonly eventsDropped: number } | null
  /** Override the lag→`lagging` threshold; defaults to {@link DESTINATION_LAG_WARNING_MS}. */
  readonly lagWarningMs?: number
}

/**
 * Pure: maps destination status + per-source freshness onto the card's health
 * badge. The headline lag is the worst (largest) across enabled sources — a
 * destination is "Up to date" only when every source is. A `lagging` badge
 * requires the destination to be active and that lag to exceed the threshold.
 */
export const deriveDestinationHealth = (input: DeriveDestinationHealthInput): DestinationHealth => {
  const lags = input.sources.map((s) => s.lagMs).filter((lag): lag is number => lag !== null)
  const lagMs = lags.length > 0 ? Math.max(...lags) : null

  const lastRunStatus = input.latestRun?.status ?? null
  const eventsDropped = input.latestRun?.eventsDropped ?? 0
  const lagWarningMs = input.lagWarningMs ?? DESTINATION_LAG_WARNING_MS

  const badge: DestinationHealthBadge =
    input.status === "paused"
      ? "paused"
      : input.status === "quarantined"
        ? "quarantined"
        : lagMs !== null && lagMs > lagWarningMs
          ? "lagging"
          : "healthy"

  return { badge, lagMs, lastRunStatus, eventsDropped }
}
