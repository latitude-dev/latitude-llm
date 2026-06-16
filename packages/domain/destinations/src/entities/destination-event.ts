/**
 * Destination-agnostic event produced by a per-kind mapper from one source
 * record. `uuid` is deterministic (UUIDv5 of destination id + record id + event
 * name) so retries and window re-runs dedupe at the destination.
 * `sourceRecordId` lets deliverers chunk record-atomically — the events a
 * single source record expands into never split across chunks or runs.
 */
export interface DestinationEvent {
  readonly uuid: string
  readonly name: string
  readonly distinctId: string
  readonly timestamp: Date
  readonly sourceRecordId: string
  readonly properties: Record<string, unknown>
}
