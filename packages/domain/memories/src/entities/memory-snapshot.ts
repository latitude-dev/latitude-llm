import type { SessionId, SpanId, TraceId } from "@domain/shared"
import type { MemoryChangeKind } from "./memory-event.ts"

/**
 * The current version of one record within a scope's manifest. `(storeId,
 * recordId)` is the record identity (D3); the remaining fields point back at the
 * span that authored this version (blame target) and carry its token count.
 */
export interface MemoryRecordVersion {
  readonly storeId: string
  readonly recordId: string
  readonly contentHash: string
  readonly changeKind: MemoryChangeKind
  readonly tokenCount: number
  readonly spanId: SpanId
  readonly traceId: TraceId
  readonly sessionId: SessionId
  readonly endTime: Date
}

/** A scope's reconstructed state at a point in time — the manifest of records. */
export interface MemorySnapshot {
  readonly scope: string
  readonly at: Date
  readonly records: readonly MemoryRecordVersion[]
}

/** Latest whole-store wipe time per store, for the reconstruction post-filter (D9). */
export interface MemoryStoreWipe {
  readonly storeId: string
  readonly endTime: Date
}
