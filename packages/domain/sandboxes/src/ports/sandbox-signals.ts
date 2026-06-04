import { Context, type Effect } from "effect"

export type SandboxRejectedIngestKind = "SandboxArchived" | "SandboxQuotaExceeded"

export interface SandboxRejectedIngestMarker {
  readonly kind: SandboxRejectedIngestKind
  readonly at: string
  readonly spansDropped: number
}

/**
 * Redis-backed, abuse-guard signals for sandbox ingestion: the per-period span
 * quota counter, the "last rejected ingest" marker, the `last_activity_at`
 * debounce, and the realtime trace-upsert Pub/Sub pulse.
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

  /**
   * Publish an id-only trace signal to the sandbox's channel, coalesced per
   * (kind, trace) so each kind pulses at most once per window. Never carries
   * trace content. The channel itself is `organizationId`-scoped, so the payload
   * carries that same sandbox-org id (a sandbox is 1:1 with its org) — not a
   * separate `sandboxes.id`.
   *
   * `kind` distinguishes the two signals from `specs/test-mode.md`:
   *  - `"liveness"` — fired at the HTTP boundary the moment spans arrive, before
   *    persist, so the UI can react instantly (activity indicator / optimistic
   *    refetch).
   *  - `"upsert"` — fired after the span is persisted, the authoritative signal
   *    to refetch the list (read-after-write safe).
   */
  publishTraceSignal(input: {
    readonly kind: "liveness" | "upsert"
    readonly organizationId: string
    readonly traceId: string
    readonly sessionId: string
    readonly coalesceMs: number
  }): Effect.Effect<void>
}

export class SandboxSignals extends Context.Service<SandboxSignals, SandboxSignalsShape>()(
  "@domain/sandboxes/SandboxSignals",
) {}
