import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { MemoryAnalyticsRange } from "../entities/memory-analytics.ts"
import { MemoryAnalyticsRepository } from "../ports/memory-analytics-repository.ts"

export interface GetMemoryActivityHistogramInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly storeId?: string
  readonly range: MemoryAnalyticsRange
  readonly bucketSeconds: number
}

/** Bucketed mutation/read activity for the Memory analytics chart. */
export const getMemoryActivityHistogramUseCase = Effect.fn("memories.getMemoryActivityHistogram")(function* (
  input: GetMemoryActivityHistogramInput,
) {
  yield* Effect.annotateCurrentSpan("memory.projectId", input.projectId)
  if (input.storeId !== undefined) yield* Effect.annotateCurrentSpan("memory.storeId", input.storeId)
  const repository = yield* MemoryAnalyticsRepository
  return yield* repository.getActivityHistogram(input)
})
