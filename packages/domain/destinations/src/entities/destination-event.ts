import type { SpanId } from "@domain/shared"

/**
 * Destination-agnostic event produced by a per-kind mapper from one source
 * span. `uuid` is deterministic (UUIDv5 of destination id + span id + event
 * name) so retries and window re-runs dedupe at the destination. `spanId`
 * lets deliverers chunk span-atomically — a root span's two events never
 * split across chunks or runs.
 */
export interface DestinationEvent {
  readonly uuid: string
  readonly name: string
  readonly distinctId: string
  readonly timestamp: Date
  readonly spanId: SpanId
  readonly properties: Record<string, unknown>
}
