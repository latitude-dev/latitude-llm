import { MEMORY_STORE_SORT_FIELDS, type MemoryStoreListItem } from "./memory-store.ts"

/** Concrete window for event-scoped analytics; "All time" resolves at the boundary. */
export interface MemoryAnalyticsRange {
  readonly from: Date
  readonly to: Date
}

/**
 * Roll-up for the analytics tiles. Live-state numbers (`live*`, `neverRead*`)
 * come from `memory_current` and ignore the range; event-derived numbers are
 * range-scoped. A version is *completed* once a later mutation supersedes it,
 * and *consumed* when read at least once before that — write yield is
 * `consumedVersions / completedVersions`, superseded-unread the difference.
 */
export interface MemoryAnalyticsOverview {
  readonly liveRecords: number
  readonly liveTokens: number
  readonly neverReadLiveTokens: number
  readonly readSessions: number
  readonly retrievedTokens: number
  readonly searchCount: number
  readonly zeroHitSearchCount: number
  readonly contentWrites: number
  readonly noopWrites: number
  readonly completedVersions: number
  readonly consumedVersions: number
}

export interface MemoryActivityBucket {
  readonly bucketStart: Date
  readonly adds: number
  readonly updates: number
  readonly removes: number
  readonly reads: number
}

export interface MemoryStoreTrendBucket {
  readonly storeId: string
  readonly bucketStart: Date
  readonly writes: number
  readonly reads: number
}

/** One store row with range-scoped insight metrics layered onto the base roll-up. */
export interface MemoryStoreMetricsItem extends MemoryStoreListItem {
  readonly readSessions: number
  readonly contentWrites: number
  readonly completedVersions: number
  readonly consumedVersions: number
  readonly netTokenGrowth: number
}

export const MEMORY_STORE_METRIC_SORT_FIELDS = [...MEMORY_STORE_SORT_FIELDS, "reads", "yield", "netGrowth"] as const
export type MemoryStoreMetricsSortField = (typeof MEMORY_STORE_METRIC_SORT_FIELDS)[number]
export const isMemoryStoreMetricsSortField = (value: string): value is MemoryStoreMetricsSortField =>
  (MEMORY_STORE_METRIC_SORT_FIELDS as readonly string[]).includes(value)

export interface MemoryStoreMetricsOptions {
  readonly limit?: number
  readonly offset?: number
  readonly sortBy?: MemoryStoreMetricsSortField
  readonly sortDirection?: "asc" | "desc"
}

export interface MemoryStoreMetricsPage {
  readonly items: readonly MemoryStoreMetricsItem[]
  readonly totalCount: number
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

/** Zero-hit searches grouped by query; `queryText` is `""` when not captured. */
export interface MemoryZeroHitQueryGroup {
  readonly queryText: string
  readonly searchCount: number
  readonly storeCount: number
  readonly anyStoreId: string
  readonly lastSeenAt: Date
}
