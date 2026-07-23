import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { MemoryAnalyticsRange } from "../entities/memory-analytics.ts"
import { MemoryAnalyticsRepository } from "../ports/memory-analytics-repository.ts"

export interface ListZeroHitQueriesInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly storeId?: string
  readonly range: MemoryAnalyticsRange
  readonly limit?: number
}

/** Searches that returned nothing, grouped by query text — the "what to add" report. */
export const listZeroHitQueriesUseCase = Effect.fn("memories.listZeroHitQueries")(function* (
  input: ListZeroHitQueriesInput,
) {
  yield* Effect.annotateCurrentSpan("memory.projectId", input.projectId)
  if (input.storeId !== undefined) yield* Effect.annotateCurrentSpan("memory.storeId", input.storeId)
  const repository = yield* MemoryAnalyticsRepository
  return yield* repository.listZeroHitQueries(input)
})
