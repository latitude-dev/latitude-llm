import { Context, type Effect } from "effect"

export type SandboxRejectedIngestKind = "SandboxArchived" | "SandboxQuotaExceeded"

export interface SandboxRejectedIngestMarker {
  readonly kind: SandboxRejectedIngestKind
  readonly at: string
  readonly spansDropped: number
}

/**
 * Redis-backed, abuse-guard signals for sandbox ingestion: the per-period span
 * quota counter, the "last rejected ingest" marker, and the `last_activity_at`
 * debounce.
 *
 * Every method **fails open** (errors are swallowed in the adapter) — these are
 * an abuse guard and a UX nicety, never a reason to drop otherwise-valid traces.
 */
export interface SandboxSignalsShape {
  /**
   * `INCRBY` the sandbox's per-period span counter and return the new total.
   * Sets a TTL to `periodEnd` so the window resets itself. Returns 0 on a Redis
   * error so the caller fails open (allows the ingest).
   */
  incrementSpanQuota(input: {
    readonly organizationId: string
    readonly periodStart: Date
    readonly periodEnd: Date
    readonly spanCount: number
  }): Effect.Effect<number>

  /** Persist the marker the sandbox UI reads (TTL'd). No-op on Redis error. */
  recordRejectedIngest(input: {
    readonly organizationId: string
    readonly marker: SandboxRejectedIngestMarker
  }): Effect.Effect<void>

  /**
   * `SET NX PX` the debounce key; returns `true` when acquired (caller should
   * write `last_activity_at`), `false` when a recent stamp still holds the key
   * or on Redis error.
   */
  tryAcquireActivityStamp(input: {
    readonly organizationId: string
    readonly debounceMs: number
  }): Effect.Effect<boolean>
}

export class SandboxSignals extends Context.Service<SandboxSignals, SandboxSignalsShape>()(
  "@domain/sandboxes/SandboxSignals",
) {}
