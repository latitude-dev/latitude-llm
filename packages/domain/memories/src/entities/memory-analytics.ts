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

/** One time bucket for the activity chart: mutation counts by kind + records retrieved. */
export interface MemoryActivityBucket {
  /** Bucket start instant (UTC ISO string). */
  readonly bucketStart: string
  readonly creations: number
  readonly updates: number
  readonly deletions: number
  readonly recordsRetrieved: number
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

/** A record ranked by how often it was retrieved in the window. */
export interface StoreMostReadRecord {
  readonly recordId: string
  readonly reads: number
}

/** A record is only "cold" once its last activity (read or write) is at least this many days ago. */
export const COLD_STORAGE_MIN_IDLE_DAYS = 7

/**
 * A live record with its last-read/last-updated instants (UTC ISO). `neverRead`
 * marks records never returned by a search all-time; `lastReadAt` is null then.
 */
export interface StoreColdRecord {
  readonly recordId: string
  readonly tokenCount: number
  readonly lastReadAt: string | null
  readonly lastUpdatedAt: string
  readonly neverRead: boolean
}

/** A search query string and how many searches used it in the window. */
export interface StoreQueryCount {
  readonly queryText: string
  readonly searches: number
}

/** A live record ranked by its current token footprint. */
export interface StoreLargestRecord {
  readonly recordId: string
  readonly tokenCount: number
}

/** One token-size bucket over the store's live records. */
export interface StoreSizeBucket {
  readonly label: string
  readonly count: number
}

/** One point of a store's live-token footprint over time (UTC ISO bucket start). */
export interface StoreTokenPoint {
  readonly bucketStart: string
  readonly tokens: number
}

/**
 * A record's write-instability signals over the window. `lastWriteAt` is the most
 * recent write instant (UTC ISO); `noOps` counts rewrites that saved byte-identical
 * content (wasted writes); `reverted` marks a content hash that returned to an
 * earlier value (A→B→A).
 */
export interface StoreWriteHealthRecord {
  readonly recordId: string
  readonly writes: number
  readonly lastWriteAt: string
  readonly noOps: number
  readonly reverted: boolean
}

/** Token-size buckets for the store size distribution; `min` inclusive, `max` exclusive (null = open-ended top). */
export const STORE_SIZE_BUCKETS: readonly {
  readonly label: string
  readonly min: number
  readonly max: number | null
}[] = [
  { label: "<100", min: 0, max: 100 },
  { label: "100–500", min: 100, max: 500 },
  { label: "500–1k", min: 500, max: 1000 },
  { label: "1k–5k", min: 1000, max: 5000 },
  { label: "5k+", min: 5000, max: null },
]

/**
 * Per-store Home-dashboard insights. Retrieval/query lists, `writeHealth`,
 * `thrashWrites`, `noOpRewrites` and `tokenHistory` are window-scoped; `coldRecords`,
 * `largestRecords`, `sizeDistribution` and the duplicate counts are
 * current-state (window-independent), matching the overview tiles. `coldRecords`
 * holds only records idle for at least `COLD_STORAGE_MIN_IDLE_DAYS`; `zeroHitQueries`
 * holds only queries whose most recent search still returned nothing.
 * `tokenHistory` is the cumulative live-token footprint per bucket — correct as
 * an absolute line only when the window starts at the store's inception (the
 * Home dashboard runs it all-time).
 */
export interface StoreInsights {
  readonly mostReadRecords: readonly StoreMostReadRecord[]
  readonly coldRecords: readonly StoreColdRecord[]
  readonly topQueries: readonly StoreQueryCount[]
  readonly zeroHitQueries: readonly StoreQueryCount[]
  readonly largestRecords: readonly StoreLargestRecord[]
  readonly sizeDistribution: readonly StoreSizeBucket[]
  readonly writeHealth: readonly StoreWriteHealthRecord[]
  readonly thrashWrites: number
  readonly noOpRewrites: number
  readonly duplicateGroups: number
  readonly duplicateRecords: number
  readonly tokenHistory: readonly StoreTokenPoint[]
}

export interface StoreInsightsOptions {
  readonly storeId: string
  readonly listLimit: number
  readonly bucketSeconds: number
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
