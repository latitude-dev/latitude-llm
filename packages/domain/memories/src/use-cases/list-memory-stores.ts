import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { MemoryStoreListOptions } from "../entities/memory-store.ts"
import { MemoryRepository } from "../ports/memory-repository.ts"

export interface ListMemoryStoresInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly options?: MemoryStoreListOptions
}

/** A project's memory stores, one roll-up row each, server-sorted and paginated. */
export const listMemoryStoresUseCase = Effect.fn("memories.listMemoryStores")(function* (input: ListMemoryStoresInput) {
  const memoryRepository = yield* MemoryRepository
  return yield* memoryRepository.listStores(input)
})
