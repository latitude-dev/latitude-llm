import { Effect } from "effect"
import type { MemoryAnalyticsScope } from "../entities/memory-analytics.ts"
import { MemoryAnalyticsRepository } from "../ports/memory-analytics-repository.ts"

export type GetMemoryActivityHistogramInput = MemoryAnalyticsScope & { readonly bucketSeconds: number }

/** Bucketed memory activity (creations/updates/deletions + records retrieved) for the chart. */
export const getMemoryActivityHistogramUseCase = Effect.fn("memories.getMemoryActivityHistogram")(function* (
  input: GetMemoryActivityHistogramInput,
) {
  const repository = yield* MemoryAnalyticsRepository
  return yield* repository.getMemoryActivityHistogram(input)
})
