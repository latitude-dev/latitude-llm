import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { MemoryRepository } from "../ports/memory-repository.ts"

export interface ReadRecordReadsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly storeId: string
  readonly recordId: string
  readonly limit?: number
}

/** The retrieval (read) events for one record, newest first. */
export const readRecordReadsUseCase = Effect.fn("memories.readRecordReads")(function* (input: ReadRecordReadsInput) {
  const memoryRepository = yield* MemoryRepository
  return yield* memoryRepository.readRecordReadEvents(input)
})
