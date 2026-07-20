import type { OrganizationId, ProjectId, SessionId, TraceId } from "@domain/shared"
import { Effect } from "effect"
import type { MemoryEvent } from "../entities/memory-event.ts"
import type { MemoryRecordVersion } from "../entities/memory-snapshot.ts"
import { MemoryRepository } from "../ports/memory-repository.ts"
import { reconstructSnapshotUseCase } from "./reconstruct-snapshot.ts"

interface SessionWriteEndpointsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly sessionId: SessionId
  /** Restrict to one trace's contribution; omit for the whole session. */
  readonly traceId?: TraceId
}

/** One record's net write within a session/trace, resolved endpoint-to-endpoint ([D2]). */
interface SessionWriteEndpoint {
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
 * The raw material both the session memory summary and diff are built from: the
 * per-record write endpoints (net change under the strict per-record rule),
 * their bodies, and the per-record read tokens. `meta` carries every record the
 * session read or wrote, in first-seen order.
 */
interface SessionWriteEndpoints {
  readonly endpoints: readonly SessionWriteEndpoint[]
  readonly bodyByHash: ReadonlyMap<string, string>
  readonly readByRecord: ReadonlyMap<string, number>
  readonly meta: ReadonlyMap<string, { readonly storeId: string; readonly recordId: string }>
}

export const recordKey = (storeId: string, recordId: string) => `${storeId}\u0000${recordId}`

/**
 * Resolve a session's (or trace's) memory writes per record under the strict
 * per-record rule ([D2]): `before` is the version current just before the
 * session's first touch, `after` its last touch, so intra-session churn
 * collapses to the net change. A whole-store wipe within the session removes the
 * store's records live at the wipe. Shared by `compute-session-memory-summary`
 * (token deltas) and `compute-session-memory-diff` (before/after bodies).
 */
export const computeSessionWriteEndpoints = Effect.fn("memories.computeSessionWriteEndpoints")(function* (
  input: SessionWriteEndpointsInput,
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
  const endpoints: SessionWriteEndpoint[] = []
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

  const addEndpoint = (endpoint: Omit<SessionWriteEndpoint, "kind">) => {
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
    seen(endpoint.storeId, endpoint.recordId)
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

  for (const [key, list] of mutatingByRecord) {
    const first = list[0]!
    const last = list[list.length - 1]!
    // chain is end_time ASC; the last version before the session's first touch is the "before".
    let before: MemoryRecordVersion | undefined
    for (const version of chainByRecord.get(key) ?? []) {
      if (version.endTime.getTime() < first.endTime.getTime()) before = version
    }
    const beforePresent = before !== undefined && before.changeKind !== "remove"
    const wipeAt = wipeAtByStore.get(first.storeId)
    const wipedAfter = wipeAt !== undefined && wipeAt.getTime() > last.endTime.getTime()
    const afterPresent = wipedAfter ? false : last.changeKind !== "remove"
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

  return { endpoints, bodyByHash, readByRecord, meta } satisfies SessionWriteEndpoints
})
