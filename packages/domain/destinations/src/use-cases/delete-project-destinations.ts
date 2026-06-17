import { type OrganizationId, type ProjectId, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"
import { DestinationSyncRunRepository } from "../ports/destination-sync-run-repository.ts"

export interface DeleteProjectDestinationsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
}

export type DeleteProjectDestinationsError = RepositoryError

/**
 * Cascade cleanup on `ProjectDeleted`. Removes the project's destinations and
 * their `destination_sync_runs` rows. Without it the sweep keeps exporting the
 * deleted project's residual ClickHouse spans — delivery keeps succeeding and
 * quarantine never fires (a privacy hole, not just orphan rows). Per the no-FK
 * platform rule, this referential integrity is application-layer.
 */
export const deleteProjectDestinationsUseCase = (input: DeleteProjectDestinationsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)

    const destinations = yield* DestinationRepository
    const syncRuns = yield* DestinationSyncRunRepository
    const cursors = yield* DestinationSourceStateRepository
    const sqlClient = yield* SqlClient

    // Atomic cascade: the destination rows and their sync-run/source-state rows
    // are removed all-or-nothing, so a mid-way failure can't leave the project
    // partially exporting or with orphaned per-source rows.
    const deleted = yield* sqlClient.transaction(
      Effect.gen(function* () {
        const deletedIds = yield* destinations.deleteByProjectId(input.projectId)
        if (deletedIds.length === 0) return 0
        yield* syncRuns.deleteByDestinationIds(deletedIds)
        yield* Effect.forEach(deletedIds, (id) => cursors.deleteByDestinationId(id), { discard: true })
        return deletedIds.length
      }),
    )

    return { deleted }
  }).pipe(Effect.withSpan("destinations.deleteProjectDestinations")) as Effect.Effect<
    { readonly deleted: number },
    DeleteProjectDestinationsError,
    SqlClient | DestinationRepository | DestinationSourceStateRepository | DestinationSyncRunRepository
  >
