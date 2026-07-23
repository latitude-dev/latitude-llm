import type { ChSqlClient, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"
import type {
  MemoryAnalyticsScope,
  MemoryStoreMetricsListOptions,
  MemoryStoreMetricsPage,
} from "../entities/memory-analytics.ts"

/**
 * Repository port for Memory analytics (ClickHouse `memory_events` +
 * `memory_current`). Separate from {@link MemoryRepository} — whose `listStores`
 * is a frozen public-API contract — so the analytics reads can evolve freely.
 * Every method is org+project+window scoped.
 */
export interface MemoryAnalyticsRepositoryShape {
  /**
   * Stores with any add/update/remove/read event in the window, one insight row
   * each, server-sorted and offset-paginated. Each row carries a per-store
   * write trend and the page-scoped net token growth (window end − start).
   */
  listStoresWithMetrics(
    input: MemoryAnalyticsScope & MemoryStoreMetricsListOptions,
  ): Effect.Effect<MemoryStoreMetricsPage, RepositoryError, ChSqlClient>
}

export class MemoryAnalyticsRepository extends Context.Service<
  MemoryAnalyticsRepository,
  MemoryAnalyticsRepositoryShape
>()("@domain/memories/MemoryAnalyticsRepository") {}
