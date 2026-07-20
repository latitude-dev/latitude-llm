import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { MemoryRepository } from "../ports/memory-repository.ts"

export interface ListStoreUsersInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly storeId: string
}

/** The end-users who accessed one store (reads count), newest access first. */
export const listStoreUsersUseCase = Effect.fn("memories.listStoreUsers")(function* (input: ListStoreUsersInput) {
  const memoryRepository = yield* MemoryRepository
  return yield* memoryRepository.listStoreUsers(input)
})
