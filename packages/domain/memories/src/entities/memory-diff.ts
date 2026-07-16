/**
 * One record's change between two points in a scope's history. Token deltas come
 * from a line diff of the two bodies; `degraded` marks a change whose body was
 * unavailable (content opt-out or a pruned blob), so the counts are the
 * record-level `tokenCount` approximation rather than a line-accurate diff ([D5]).
 */
export interface MemoryRecordChange {
  readonly storeId: string
  readonly recordId: string
  readonly kind: "added" | "updated" | "removed"
  readonly tokensAdded: number
  readonly tokensRemoved: number
  readonly beforeHash: string
  readonly afterHash: string
  readonly degraded: boolean
}

/** The diff of a scope between two points: changed records, pruned by hash equality. */
export interface MemoryDiff {
  readonly scope: string
  readonly changes: readonly MemoryRecordChange[]
  readonly tokensAdded: number
  readonly tokensRemoved: number
  readonly recordsChanged: { readonly added: number; readonly updated: number; readonly removed: number }
}
