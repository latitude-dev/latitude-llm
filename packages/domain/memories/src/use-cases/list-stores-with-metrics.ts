import { Effect } from "effect"
import type { MemoryAnalyticsScope, MemoryStoreMetricsListOptions } from "../entities/memory-analytics.ts"
import { MemoryAnalyticsRepository } from "../ports/memory-analytics-repository.ts"

export type ListStoresWithMetricsInput = MemoryAnalyticsScope & MemoryStoreMetricsListOptions

/** A project's memory stores with window-scoped insight metrics, server-sorted and paginated. */
export const listStoresWithMetricsUseCase = Effect.fn("memories.listStoresWithMetrics")(function* (
  input: ListStoresWithMetricsInput,
) {
  const repository = yield* MemoryAnalyticsRepository
  return yield* repository.listStoresWithMetrics(input)
})
