import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { MemorySnapshot } from "../entities/memory-snapshot.ts"
import { MemoryRepository } from "../ports/memory-repository.ts"

export interface ReconstructSnapshotInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly scope: string
  /** Point in time to reconstruct; omit for the current state (T = now). */
  readonly at?: Date
}

/**
 * Reconstruct a scope's manifest at a point in time. `at` omitted → the hot
 * `memory_current` projection; otherwise the ledger as of `at`. Both then apply
 * the whole-store wipe post-filter (D9): a record is dropped if its store was
 * wiped after the record's latest mutation.
 */
export const reconstructSnapshotUseCase = Effect.fn("memories.reconstructSnapshot")(function* (
  input: ReconstructSnapshotInput,
) {
  const { organizationId, projectId, scope, at } = input
  const memoryRepository = yield* MemoryRepository
  const asOf = at ?? new Date()

  const versions =
    at === undefined
      ? yield* memoryRepository.readCurrentSnapshot({ organizationId, projectId, scope })
      : yield* memoryRepository.readManifestAt({ organizationId, projectId, scope, at })

  const wipes = yield* memoryRepository.readLatestStoreWipes({ organizationId, projectId, scope, at: asOf })
  const wipedAtByStore = new Map(wipes.map((wipe) => [wipe.storeId, wipe.endTime.getTime()]))

  const records = versions.filter((version) => {
    const wipedAt = wipedAtByStore.get(version.storeId)
    return wipedAt === undefined || version.endTime.getTime() >= wipedAt
  })

  return { scope, at: asOf, records } satisfies MemorySnapshot
})
