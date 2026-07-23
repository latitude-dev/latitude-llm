import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { MemoryAnalyticsRange } from "../entities/memory-analytics.ts"
import { MemoryAnalyticsRepository } from "../ports/memory-analytics-repository.ts"

export interface GetMemoryAnalyticsOverviewInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly storeId?: string
  readonly range: MemoryAnalyticsRange
}

/** The Memory-page (or store-overview) tile roll-up over the ledger. */
export const getMemoryAnalyticsOverviewUseCase = Effect.fn("memories.getMemoryAnalyticsOverview")(function* (
  input: GetMemoryAnalyticsOverviewInput,
) {
  yield* Effect.annotateCurrentSpan("memory.projectId", input.projectId)
  if (input.storeId !== undefined) yield* Effect.annotateCurrentSpan("memory.storeId", input.storeId)
  const repository = yield* MemoryAnalyticsRepository
  return yield* repository.getOverview(input)
})
