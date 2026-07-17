import type { ExternalUserId } from "@domain/shared"

/**
 * One row of the store roll-up. Current-derived metrics (record/token/updated)
 * come from `memory_current`; event-derived metrics (sessions/users/read) come
 * from `memory_events` and are `0` / `null` when the store has no ledger events.
 */
export interface MemoryStoreListItem {
  readonly storeId: string
  readonly recordCount: number
  readonly tokenCount: number
  readonly lastUpdatedAt: Date
  readonly sessionCount: number
  readonly userCount: number
  readonly lastReadAt: Date | null
}

export const MEMORY_STORE_SORT_FIELDS = ["lastUpdated", "lastRead", "records", "tokens", "sessions", "users"] as const
export type MemoryStoreSortField = (typeof MEMORY_STORE_SORT_FIELDS)[number]
export const isMemoryStoreSortField = (value: string): value is MemoryStoreSortField =>
  (MEMORY_STORE_SORT_FIELDS as readonly string[]).includes(value)

export interface MemoryStoreListOptions {
  readonly limit?: number
  readonly offset?: number
  readonly sortBy?: MemoryStoreSortField
  readonly sortDirection?: "asc" | "desc"
}

export interface MemoryStoreListPage {
  readonly items: readonly MemoryStoreListItem[]
  readonly totalCount: number
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

/** A user who touched one store (reads count as access). */
export interface MemoryStoreUser {
  readonly userId: ExternalUserId
  readonly lastAccessedAt: Date
}

/** A store one user touched (reads count as access). */
export interface MemoryUserStore {
  readonly storeId: string
  readonly lastAccessedAt: Date
}
