import type { OrganizationId, ProjectId, SessionId, TraceId } from "@domain/shared"
import { Effect } from "effect"
import type { MemoryEvent } from "../entities/memory-event.ts"
import type { MemoryRecordVersion } from "../entities/memory-snapshot.ts"
import { MemoryRepository } from "../ports/memory-repository.ts"
import { recordTokenDelta } from "./diff-record-bodies.ts"
import { reconstructSnapshotUseCase } from "./reconstruct-snapshot.ts"

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

const recordKey = (storeId: string, recordId: string) => `${storeId}\u0000${recordId}`

type WriteEndpoint = {
  readonly storeId: string
  readonly recordId: string
  readonly kind: "added" | "updated" | "removed"
  readonly beforeHash: string
  readonly afterHash: string
  readonly beforeTokens: number
  readonly afterTokens: number
  readonly afterPresent: boolean
}

/**
 * A session's memory footprint, broken down per record: read tokens (Σ over the
 * record's `search_memory` events) and the write diff under the strict per-record
 * rule ([D2]) — `before` is the version current just before the session's first
 * touch, `after` its last touch, so intra-session churn collapses to the net
 * change. A whole-store wipe within the session removes the store's records live
 * at the wipe.
 */
export const computeSessionMemorySummaryUseCase = Effect.fn("memories.computeSessionMemorySummary")(function* (
  input: ComputeSessionMemorySummaryInput,
) {
  const { organizationId, projectId, sessionId, traceId } = input
  const memoryRepository = yield* MemoryRepository

  const events = yield* memoryRepository.readSessionMemoryEvents({
    organizationId,
    projectId,
    sessionId,
    ...(traceId !== undefined ? { traceId } : {}),
  })

  const meta = new Map<string, { storeId: string; recordId: string }>()
  const seen = (storeId: string, recordId: string) => {
    const key = recordKey(storeId, recordId)
    if (!meta.has(key)) meta.set(key, { storeId, recordId })
    return key
  }

  const readByRecord = new Map<string, number>()
  const endpoints: WriteEndpoint[] = []
  const hashes = new Set<string>()

  const mutatingByRecord = new Map<string, MemoryEvent[]>()
  const wipeAtByStore = new Map<string, Date>()

  for (const event of events) {
    if (event.changeKind === "read") {
      const key = seen(event.storeId, event.recordId)
      readByRecord.set(key, (readByRecord.get(key) ?? 0) + event.tokenCount)
    } else if (event.changeKind === "store_delete") {
      const prev = wipeAtByStore.get(event.storeId)
      if (prev === undefined || event.endTime.getTime() > prev.getTime())
        wipeAtByStore.set(event.storeId, event.endTime)
    } else if (event.changeKind === "add" || event.changeKind === "update" || event.changeKind === "remove") {
      const key = recordKey(event.storeId, event.recordId)
      const list = mutatingByRecord.get(key)
      if (list) list.push(event)
      else mutatingByRecord.set(key, [event])
    }
  }

  const addEndpoint = (endpoint: Omit<WriteEndpoint, "kind">) => {
    const { beforeHash, afterHash, afterPresent } = endpoint
    const kind = !afterPresent
      ? beforeHash === ""
        ? null
        : "removed"
      : beforeHash === ""
        ? "added"
        : afterHash === beforeHash
          ? null
          : "updated"
    if (kind === null) return
    endpoints.push({ kind, ...endpoint })
    if (beforeHash !== "") hashes.add(beforeHash)
    if (afterPresent && afterHash !== "") hashes.add(afterHash)
  }

  const touchedRecords = [...mutatingByRecord.values()].map((list) => ({
    storeId: list[0]!.storeId,
    recordId: list[0]!.recordId,
  }))
  const versions =
    touchedRecords.length > 0
      ? yield* memoryRepository.readRecordVersions({ organizationId, projectId, records: touchedRecords })
      : []
  const chainByRecord = new Map<string, MemoryRecordVersion[]>()
  for (const version of versions) {
    const key = recordKey(version.storeId, version.recordId)
    const list = chainByRecord.get(key)
    if (list) list.push(version)
    else chainByRecord.set(key, [version])
  }

  const eventOrder = new Map(events.map((event, index) => [event, index]))

  for (const [key, list] of mutatingByRecord) {
    const first = list[0]!
    const last = list[list.length - 1]!
    // chain is end_time ASC; the last version before the session's first touch is the "before".
    let before: MemoryRecordVersion | undefined
    for (const version of chainByRecord.get(key) ?? []) {
      if (version.endTime.getTime() < first.endTime.getTime()) before = version
    }
    const beforePresent = before !== undefined && before.changeKind !== "remove"
    const storeWipedAfterLastTouch = events.some(
      (event) =>
        event.storeId === first.storeId &&
        event.changeKind === "store_delete" &&
        (event.endTime.getTime() > last.endTime.getTime() ||
          (event.endTime.getTime() === last.endTime.getTime() &&
            (eventOrder.get(event) ?? -1) > (eventOrder.get(last) ?? -1))),
    )
    const afterPresent = storeWipedAfterLastTouch ? false : last.changeKind !== "remove"
    addEndpoint({
      storeId: first.storeId,
      recordId: first.recordId,
      beforeHash: beforePresent ? before!.contentHash : "",
      beforeTokens: beforePresent ? before!.tokenCount : 0,
      afterHash: afterPresent ? last.contentHash : "",
      afterTokens: afterPresent ? last.tokenCount : 0,
      afterPresent,
    })
  }

  // Records the wipe removed that the session did not otherwise touch. Read the
  // store's live records as of just before the wipe via reconstruction (not raw
  // readManifestAt at the wipe): reconstruction applies the store-wipe
  // post-filter, so records already dropped by an earlier wipe aren't counted
  // as removed again. The 1ms-before instant keeps the current wipe out of that
  // filter while including everything live up to it.
  const touchedKeys = new Set(mutatingByRecord.keys())
  for (const [storeId, wipeAt] of wipeAtByStore) {
    const beforeWipe = new Date(wipeAt.getTime() - 1)
    const snapshot = yield* reconstructSnapshotUseCase({ organizationId, projectId, storeId, at: beforeWipe })
    for (const record of snapshot.records) {
      if (touchedKeys.has(recordKey(record.storeId, record.recordId))) continue
      addEndpoint({
        storeId: record.storeId,
        recordId: record.recordId,
        beforeHash: record.contentHash,
        beforeTokens: record.tokenCount,
        afterHash: "",
        afterTokens: 0,
        afterPresent: false,
      })
    }
  }

  const blobs = yield* memoryRepository.readBlobs({ organizationId, hashes: [...hashes] })
  const bodyByHash = new Map(blobs.map((blob) => [blob.contentHash, blob.content]))
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
    const key = seen(endpoint.storeId, endpoint.recordId)
    writeByRecord.set(key, { added: delta.tokensAdded, removed: delta.tokensRemoved })
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
