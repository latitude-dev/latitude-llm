import { Effect } from "effect"
import type { MemoryBlob } from "../entities/memory-blob.ts"
import type { MemoryCurrentEntry } from "../entities/memory-current.ts"
import { MEMORY_MUTATING_CHANGE_KINDS, type MemoryEvent } from "../entities/memory-event.ts"
import type { MemoryRecordVersion, MemoryStoreWipe } from "../entities/memory-snapshot.ts"
import type { MemoryRepositoryShape } from "../ports/memory-repository.ts"

const recordKey = (storeId: string, recordId: string) => `${storeId}\u0000${recordId}`
const blobKey = (organizationId: string, contentHash: string) => `${organizationId}\u0000${contentHash}`
const isMutating = (kind: MemoryEvent["changeKind"]): boolean =>
  (MEMORY_MUTATING_CHANGE_KINDS as readonly string[]).includes(kind)

const toVersion = (entry: MemoryCurrentEntry | MemoryEvent): MemoryRecordVersion => ({
  storeId: entry.storeId,
  recordId: entry.recordId,
  contentHash: entry.contentHash,
  changeKind: entry.changeKind,
  tokenCount: entry.tokenCount,
  spanId: entry.spanId,
  traceId: entry.traceId,
  sessionId: entry.sessionId,
  endTime: entry.endTime,
})

/**
 * In-memory `MemoryRepository` that faithfully mirrors the ClickHouse read
 * semantics (blob dedup, latest-by-`endTime` manifest, store-wipe times), so
 * reconstruct / materialize use-case tests run without chdb.
 */
export const createFakeMemoryRepository = (overrides?: Partial<MemoryRepositoryShape>) => {
  const events: MemoryEvent[] = []
  const blobs = new Map<string, MemoryBlob>()
  const current = new Map<string, MemoryCurrentEntry>()

  const repository: MemoryRepositoryShape = {
    insertEvents: (incoming) =>
      Effect.sync(() => {
        events.push(...incoming)
      }),
    upsertBlobs: (incoming) =>
      Effect.sync(() => {
        for (const blob of incoming) blobs.set(blobKey(blob.organizationId, blob.contentHash), blob)
      }),
    upsertCurrent: (entries) =>
      Effect.sync(() => {
        for (const entry of entries) {
          const key = recordKey(entry.storeId, entry.recordId)
          const existing = current.get(key)
          if (!existing || entry.endTime >= existing.endTime) current.set(key, entry)
        }
      }),
    readCurrentSnapshot: ({ organizationId, projectId, storeId }) =>
      Effect.sync(() =>
        [...current.values()]
          .filter(
            (entry) =>
              entry.organizationId === organizationId &&
              entry.projectId === projectId &&
              entry.storeId === storeId &&
              entry.changeKind !== "remove",
          )
          .map(toVersion),
      ),
    readManifestAt: ({ organizationId, projectId, storeId, at }) =>
      Effect.sync(() => {
        const latest = new Map<string, MemoryEvent>()
        for (const event of events) {
          if (event.organizationId !== organizationId || event.projectId !== projectId) continue
          if (event.storeId !== storeId || !isMutating(event.changeKind) || event.endTime > at) continue
          const key = recordKey(event.storeId, event.recordId)
          const winner = latest.get(key)
          if (!winner || event.endTime >= winner.endTime) latest.set(key, event)
        }
        return [...latest.values()].filter((event) => event.changeKind !== "remove").map(toVersion)
      }),
    readLatestStoreWipes: ({ organizationId, projectId, storeId, at }) =>
      Effect.sync(() => {
        const latest = new Map<string, Date>()
        for (const event of events) {
          if (event.organizationId !== organizationId || event.projectId !== projectId) continue
          if (event.storeId !== storeId || event.changeKind !== "store_delete" || event.endTime > at) continue
          const existing = latest.get(event.storeId)
          if (!existing || event.endTime > existing) latest.set(event.storeId, event.endTime)
        }
        return [...latest.entries()].map(
          ([wipedStoreId, endTime]) => ({ storeId: wipedStoreId, endTime }) satisfies MemoryStoreWipe,
        )
      }),
    readBlobs: ({ organizationId, hashes }) =>
      Effect.sync(() => {
        const wanted = new Set(hashes.filter((hash) => hash !== ""))
        return [...blobs.values()].filter(
          (blob) => blob.organizationId === organizationId && wanted.has(blob.contentHash),
        )
      }),
    readSessionMemoryEvents: ({ organizationId, projectId, sessionId, traceId }) =>
      Effect.sync(() => {
        const deduped = new Map<string, MemoryEvent>()
        for (const event of events) {
          if (event.organizationId !== organizationId || event.projectId !== projectId) continue
          if (event.sessionId !== sessionId) continue
          if (traceId !== undefined && event.traceId !== traceId) continue
          deduped.set(`${event.spanId}\u0000${event.storeId}\u0000${event.recordId}`, event)
        }
        return [...deduped.values()].sort((a, b) => a.endTime.getTime() - b.endTime.getTime())
      }),
    readRecordVersions: ({ organizationId, projectId, records, at }) =>
      Effect.sync(() => {
        const wanted = new Set(records.map((record) => `${record.storeId}\u0000${record.recordId}`))
        const deduped = new Map<string, MemoryEvent>()
        for (const event of events) {
          if (event.organizationId !== organizationId || event.projectId !== projectId) continue
          if (!isMutating(event.changeKind)) continue
          if (!wanted.has(`${event.storeId}\u0000${event.recordId}`)) continue
          if (at !== undefined && event.endTime > at) continue
          deduped.set(`${event.spanId}\u0000${event.storeId}\u0000${event.recordId}`, event)
        }
        return [...deduped.values()]
          .sort(
            (a, b) =>
              a.storeId.localeCompare(b.storeId) ||
              a.recordId.localeCompare(b.recordId) ||
              a.endTime.getTime() - b.endTime.getTime(),
          )
          .map(toVersion)
      }),
    ...overrides,
  }

  return { repository, events, blobs, current }
}
