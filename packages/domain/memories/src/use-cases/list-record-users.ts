import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { MemoryRepository } from "../ports/memory-repository.ts"

export interface ListRecordUsersInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly storeId: string
  readonly recordId: string
}

/** The end-users who accessed one record (reads and writes), newest access first. */
export const listRecordUsersUseCase = Effect.fn("memories.listRecordUsers")(function* (input: ListRecordUsersInput) {
  const memoryRepository = yield* MemoryRepository
  return yield* memoryRepository.listRecordUsers(input)
})
