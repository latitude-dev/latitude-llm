import type { ExternalUserId } from "@domain/shared"
import { Effect } from "effect"
import type { MemoryBlob } from "../entities/memory-blob.ts"
import type { MemoryCurrentEntry } from "../entities/memory-current.ts"
import { MEMORY_MUTATING_CHANGE_KINDS, type MemoryEvent } from "../entities/memory-event.ts"
import type { MemoryRecordVersion, MemoryStoreWipe } from "../entities/memory-snapshot.ts"
import type { MemoryStoreListItem } from "../entities/memory-store.ts"
import type { MemoryRepositoryShape } from "../ports/memory-repository.ts"

const STORE_ACCESS_LIST_CAP = 1000

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
    listStores: ({ organizationId, projectId, options }) =>
      Effect.sync(() => {
        const liveByStore = new Map<string, { recordCount: number; tokenCount: number; lastUpdatedAt: Date }>()
        for (const entry of current.values()) {
          if (entry.organizationId !== organizationId || entry.projectId !== projectId) continue
          if (entry.changeKind === "remove") continue
          const agg = liveByStore.get(entry.storeId)
          if (!agg)
            liveByStore.set(entry.storeId, {
              recordCount: 1,
              tokenCount: entry.tokenCount,
              lastUpdatedAt: entry.endTime,
            })
          else {
            agg.recordCount += 1
            agg.tokenCount += entry.tokenCount
            if (entry.endTime > agg.lastUpdatedAt) agg.lastUpdatedAt = entry.endTime
          }
        }

        const eventByStore = new Map<string, { sessions: Set<string>; users: Set<string>; lastReadAt: Date | null }>()
        for (const event of events) {
          if (event.organizationId !== organizationId || event.projectId !== projectId) continue
          let agg = eventByStore.get(event.storeId)
          if (!agg) {
            agg = { sessions: new Set(), users: new Set(), lastReadAt: null }
            eventByStore.set(event.storeId, agg)
          }
          if (event.sessionId !== "") agg.sessions.add(event.sessionId)
          if (event.userId !== "") agg.users.add(event.userId)
          if (event.changeKind === "read" && (agg.lastReadAt === null || event.endTime > agg.lastReadAt))
            agg.lastReadAt = event.endTime
        }

        const items: MemoryStoreListItem[] = [...liveByStore.entries()].map(([storeId, agg]) => {
          const ev = eventByStore.get(storeId)
          return {
            storeId,
            recordCount: agg.recordCount,
            tokenCount: agg.tokenCount,
            lastUpdatedAt: agg.lastUpdatedAt,
            sessionCount: ev ? ev.sessions.size : 0,
            userCount: ev ? ev.users.size : 0,
            lastReadAt: ev ? ev.lastReadAt : null,
          }
        })

        const sortBy = options?.sortBy ?? "lastUpdated"
        const dir = options?.sortDirection === "asc" ? 1 : -1
        const sortValue = (item: MemoryStoreListItem): number => {
          switch (sortBy) {
            case "lastUpdated":
              return item.lastUpdatedAt.getTime()
            case "lastRead":
              return item.lastReadAt ? item.lastReadAt.getTime() : 0
            case "records":
              return item.recordCount
            case "tokens":
              return item.tokenCount
            case "sessions":
              return item.sessionCount
            case "users":
              return item.userCount
          }
        }
        items.sort((a, b) => {
          const cmp = (sortValue(a) - sortValue(b)) * dir
          if (cmp !== 0) return cmp
          return a.storeId < b.storeId ? -1 : a.storeId > b.storeId ? 1 : 0
        })

        const totalCount = items.length
        const limit = options?.limit ?? 50
        const offset = options?.offset ?? 0
        const rest = items.slice(offset)
        const hasMore = rest.length > limit
        return { items: hasMore ? rest.slice(0, limit) : rest, totalCount, hasMore, limit, offset }
      }),
    listStoreUsers: ({ organizationId, projectId, storeId }) =>
      Effect.sync(() => {
        const latest = new Map<ExternalUserId, Date>()
        for (const event of events) {
          if (event.organizationId !== organizationId || event.projectId !== projectId) continue
          if (event.storeId !== storeId || event.userId === "") continue
          const existing = latest.get(event.userId)
          if (!existing || event.endTime > existing) latest.set(event.userId, event.endTime)
        }
        return [...latest.entries()]
          .map(([userId, lastAccessedAt]) => ({ userId, lastAccessedAt }))
          .sort(
            (a, b) =>
              b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime() ||
              (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
          )
          .slice(0, STORE_ACCESS_LIST_CAP)
      }),
    listUserStores: ({ organizationId, projectId, userId }) =>
      Effect.sync(() => {
        const latest = new Map<string, Date>()
        for (const event of events) {
          if (event.organizationId !== organizationId || event.projectId !== projectId) continue
          if (event.userId !== userId) continue
          const existing = latest.get(event.storeId)
          if (!existing || event.endTime > existing) latest.set(event.storeId, event.endTime)
        }
        return [...latest.entries()]
          .map(([storeId, lastAccessedAt]) => ({ storeId, lastAccessedAt }))
          .sort(
            (a, b) =>
              b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime() ||
              (a.storeId < b.storeId ? -1 : a.storeId > b.storeId ? 1 : 0),
          )
          .slice(0, STORE_ACCESS_LIST_CAP)
      }),
    ...overrides,
  }

  return { repository, events, blobs, current }
}
