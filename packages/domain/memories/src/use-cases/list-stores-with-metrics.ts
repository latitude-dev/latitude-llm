import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { MemoryAnalyticsRange, MemoryStoreMetricsOptions } from "../entities/memory-analytics.ts"
import { MemoryAnalyticsRepository } from "../ports/memory-analytics-repository.ts"

export interface ListStoresWithMetricsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly range: MemoryAnalyticsRange
  readonly options?: MemoryStoreMetricsOptions
  /** When set, buckets for each returned store's trend sparkline are fetched and zipped in. */
  readonly trendBucketSeconds?: number
}

/**
 * The project's memory stores with range-scoped insight metrics, plus (when
 * `trendBucketSeconds` is set) each store's write/read trend buckets keyed by
 * store id for the sparkline column.
 */
export const listStoresWithMetricsUseCase = Effect.fn("memories.listStoresWithMetrics")(function* (
  input: ListStoresWithMetricsInput,
) {
  yield* Effect.annotateCurrentSpan("memory.projectId", input.projectId)
  const repository = yield* MemoryAnalyticsRepository

  const page = yield* repository.listStoresWithMetrics({
    organizationId: input.organizationId,
    projectId: input.projectId,
    range: input.range,
    ...(input.options ? { options: input.options } : {}),
  })

  if (input.trendBucketSeconds === undefined || page.items.length === 0) {
    return { page, trends: [] as const }
  }

  const trends = yield* repository.getStoreTrendBuckets({
    organizationId: input.organizationId,
    projectId: input.projectId,
    storeIds: page.items.map((item) => item.storeId),
    range: input.range,
    bucketSeconds: input.trendBucketSeconds,
  })

  return { page, trends }
})
