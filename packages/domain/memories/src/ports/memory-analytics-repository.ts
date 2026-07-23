import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"
import type {
  MemoryActivityBucket,
  MemoryAnalyticsOverview,
  MemoryAnalyticsRange,
  MemoryStoreMetricsOptions,
  MemoryStoreMetricsPage,
  MemoryStoreTrendBucket,
  MemoryZeroHitQueryGroup,
} from "../entities/memory-analytics.ts"

/**
 * Read-only analytics over the memory ledger (ClickHouse), backing the Memory
 * insights surfaces. Like `MemoryRepository`, the `ChSqlClient` requirement is
 * intentionally leaked (per-request org scope). Methods taking an optional
 * `storeId` serve both the project-wide Memory page and the store overview.
 */
export interface MemoryAnalyticsRepositoryShape {
  /** Tile roll-up: live footprint plus range-scoped read/write/version-outcome counts. */
  getOverview(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly storeId?: string
    readonly range: MemoryAnalyticsRange
  }): Effect.Effect<MemoryAnalyticsOverview, RepositoryError, ChSqlClient>

  /** Bucketed mutation/read activity for the analytics chart. */
  getActivityHistogram(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly storeId?: string
    readonly range: MemoryAnalyticsRange
    readonly bucketSeconds: number
  }): Effect.Effect<readonly MemoryActivityBucket[], RepositoryError, ChSqlClient>

  /** The store list roll-up plus range-scoped metrics, server-sorted and paginated. */
  listStoresWithMetrics(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly range: MemoryAnalyticsRange
    readonly options?: MemoryStoreMetricsOptions
  }): Effect.Effect<MemoryStoreMetricsPage, RepositoryError, ChSqlClient>

  /** Bucketed writes/reads for the given stores' trend sparklines (one page's ids). */
  getStoreTrendBuckets(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly storeIds: readonly string[]
    readonly range: MemoryAnalyticsRange
    readonly bucketSeconds: number
  }): Effect.Effect<readonly MemoryStoreTrendBucket[], RepositoryError, ChSqlClient>

  /** Zero-hit searches grouped by query text, most frequent first. */
  listZeroHitQueries(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly storeId?: string
    readonly range: MemoryAnalyticsRange
    readonly limit?: number
  }): Effect.Effect<readonly MemoryZeroHitQueryGroup[], RepositoryError, ChSqlClient>
}

export class MemoryAnalyticsRepository extends Context.Service<
  MemoryAnalyticsRepository,
  MemoryAnalyticsRepositoryShape
>()("@domain/memories/MemoryAnalyticsRepository") {}
