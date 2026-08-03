import type { ExternalUserId, OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { MemoryRepository } from "../ports/memory-repository.ts"

export interface ListUserStoresInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly userId: ExternalUserId
}

/** The memory stores one end-user accessed (reads count), newest access first. */
export const listUserStoresUseCase = Effect.fn("memories.listUserStores")(function* (input: ListUserStoresInput) {
  const memoryRepository = yield* MemoryRepository
  return yield* memoryRepository.listUserStores(input)
})
