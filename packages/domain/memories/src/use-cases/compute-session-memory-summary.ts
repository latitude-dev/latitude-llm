import type { OrganizationId, ProjectId, SessionId, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { recordTokenDelta } from "./diff-record-bodies.ts"
import { computeSessionWriteEndpoints, recordKey } from "./session-write-endpoints.ts"

export interface ComputeSessionMemorySummaryInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly sessionId: SessionId
  /** Restrict to one trace's contribution; omit for the whole session. */
  readonly traceId?: TraceId
}

/** One record's contribution to a session/trace: tokens read, added, and removed. */
export interface MemoryRecordSummary {
  readonly storeId: string
  readonly recordId: string
  readonly readTokens: number
  readonly tokensAdded: number
  readonly tokensRemoved: number
}

export interface MemorySummaryTotals {
  readonly readTokens: number
  readonly tokensAdded: number
  readonly tokensRemoved: number
}

/** A session's (or trace's) memory footprint: per-record read/write tokens plus the total. */
export interface SessionMemorySummary {
  readonly records: readonly MemoryRecordSummary[]
  readonly total: MemorySummaryTotals
}

/**
 * A session's memory footprint, broken down per record: read tokens (Σ over the
 * record's `search_memory` events) and the write diff under the strict per-record
 * rule ([D2]) — `before` is the version current just before the session's first
 * touch, `after` its last touch, so intra-session churn collapses to the net
 * change. A record read *and* written merges into one entry.
 */
export const computeSessionMemorySummaryUseCase = Effect.fn("memories.computeSessionMemorySummary")(function* (
  input: ComputeSessionMemorySummaryInput,
) {
  const { endpoints, bodyByHash, readByRecord, meta } = yield* computeSessionWriteEndpoints(input)
  const body = (hash: string): string | null => (hash === "" ? null : (bodyByHash.get(hash) ?? null))

  const writeByRecord = new Map<string, { added: number; removed: number }>()
  for (const endpoint of endpoints) {
    const delta = recordTokenDelta({
      kind: endpoint.kind,
      beforeHash: endpoint.beforeHash,
      afterHash: endpoint.afterHash,
      beforeBody: body(endpoint.beforeHash),
      afterBody: endpoint.afterPresent ? body(endpoint.afterHash) : null,
      beforeTokens: endpoint.beforeTokens,
      afterTokens: endpoint.afterTokens,
    })
    writeByRecord.set(recordKey(endpoint.storeId, endpoint.recordId), {
      added: delta.tokensAdded,
      removed: delta.tokensRemoved,
    })
  }

  const records: MemoryRecordSummary[] = []
  for (const [key, { storeId, recordId }] of meta) {
    const readTokens = readByRecord.get(key) ?? 0
    const write = writeByRecord.get(key) ?? { added: 0, removed: 0 }
    if (readTokens === 0 && write.added === 0 && write.removed === 0) continue
    records.push({ storeId, recordId, readTokens, tokensAdded: write.added, tokensRemoved: write.removed })
  }

  const total = records.reduce<MemorySummaryTotals>(
    (acc, record) => ({
      readTokens: acc.readTokens + record.readTokens,
      tokensAdded: acc.tokensAdded + record.tokensAdded,
      tokensRemoved: acc.tokensRemoved + record.tokensRemoved,
    }),
    { readTokens: 0, tokensAdded: 0, tokensRemoved: 0 },
  )

  return { records, total } satisfies SessionMemorySummary
})
