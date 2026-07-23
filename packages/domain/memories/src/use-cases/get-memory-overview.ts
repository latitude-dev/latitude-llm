import { Effect } from "effect"
import type { MemoryAnalyticsScope } from "../entities/memory-analytics.ts"
import { MemoryAnalyticsRepository } from "../ports/memory-analytics-repository.ts"

export type GetMemoryOverviewInput = MemoryAnalyticsScope & { readonly storeId?: string }

/** Project-wide memory roll-up for the analytics tiles. */
export const getMemoryOverviewUseCase = Effect.fn("memories.getMemoryOverview")(function* (
  input: GetMemoryOverviewInput,
) {
  const repository = yield* MemoryAnalyticsRepository
  return yield* repository.getMemoryOverview(input)
})
