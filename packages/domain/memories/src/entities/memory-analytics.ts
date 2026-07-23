import type { OrganizationId, ProjectId } from "@domain/shared"

/** Org+project+time window for every analytics read. */
export interface MemoryAnalyticsScope {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly from: Date
  readonly to: Date
}

/**
 * Project-wide roll-up for the analytics tiles. `live*`/`deadTokens` are
 * current-state (window-independent); the rest are window-scoped. Rates
 * (dead-token %, zero-hit, read:write) are derived by the consumer.
 */
export interface MemoryOverview {
  readonly liveRecords: number
  readonly liveTokens: number
  readonly deadTokens: number
  readonly searches: number
  readonly zeroHitSearches: number
  readonly writes: number
  readonly recordsRetrieved: number
}

/** One write-activity bucket for a store's per-row trend sparkline. */
export interface MemoryActivityWriteBucket {
  /** Bucket start instant (UTC ISO string). */
  readonly bucketStart: string
  readonly writes: number
}

/**
 * One store row with insight metrics. `live*`/`deadRecords` come from
 * `memory_current` and ignore the window (current state); every other count is
 * window-scoped. `netGrowthTokens` is the live-token footprint at the window
 * end minus the start. Derived rates (read:write, dead %, zero-hit, churn) are
 * computed by the consumer from these raw counts so tooltips keep the numerator
 * and denominator.
 */
export interface MemoryStoreMetricsItem {
  readonly storeId: string
  readonly liveRecords: number
  readonly liveTokens: number
  readonly deadRecords: number
  readonly writes: number
  readonly reads: number
  readonly searches: number
  readonly zeroHitSearches: number
  readonly updateEvents: number
  readonly recordsTouched: number
  readonly sessionCount: number
  readonly userCount: number
  readonly lastActivityAt: Date | null
  readonly netGrowthTokens: number
  readonly trend: readonly MemoryActivityWriteBucket[]
}

// `netGrowth` is deliberately absent — it is page-scoped (computed only for the
// returned page), so it cannot back a server-side ORDER BY.
export const MEMORY_STORE_METRIC_SORT_FIELDS = [
  "records",
  "tokens",
  "sessions",
  "users",
  "writes",
  "reads",
  "ratio",
  "dead",
  "zeroHit",
  "churn",
  "lastActivity",
] as const
export type MemoryStoreMetricSortField = (typeof MEMORY_STORE_METRIC_SORT_FIELDS)[number]
export const isMemoryStoreMetricSortField = (value: string): value is MemoryStoreMetricSortField =>
  (MEMORY_STORE_METRIC_SORT_FIELDS as readonly string[]).includes(value)

export interface MemoryStoreMetricsListOptions {
  readonly sortBy: MemoryStoreMetricSortField
  readonly sortDirection: "asc" | "desc"
  readonly limit: number
  readonly offset: number
  readonly trendBucketSeconds: number
}

export interface MemoryStoreMetricsPage {
  readonly items: readonly MemoryStoreMetricsItem[]
  readonly totalCount: number
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}
