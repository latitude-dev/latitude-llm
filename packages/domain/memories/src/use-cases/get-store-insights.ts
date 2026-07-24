import { Effect } from "effect"
import type { MemoryAnalyticsScope, StoreInsightsOptions } from "../entities/memory-analytics.ts"
import { MemoryAnalyticsRepository } from "../ports/memory-analytics-repository.ts"

export type GetStoreInsightsInput = MemoryAnalyticsScope & StoreInsightsOptions

/** One store's Home-dashboard insight lists (retrieval, queries, footprint). */
export const getStoreInsightsUseCase = Effect.fn("memories.getStoreInsights")(function* (input: GetStoreInsightsInput) {
  const repository = yield* MemoryAnalyticsRepository
  return yield* repository.getStoreInsights(input)
})
