import type { OrganizationId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
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
    const deletedIds = yield* destinations.deleteByProjectId(input.projectId)

    if (deletedIds.length === 0) {
      return { deleted: 0 }
    }

    const syncRuns = yield* DestinationSyncRunRepository
    yield* syncRuns.deleteByDestinationIds(deletedIds)

    const cursors = yield* DestinationSourceStateRepository
    yield* Effect.forEach(deletedIds, (id) => cursors.deleteByDestinationId(id), { discard: true })

    return { deleted: deletedIds.length }
  }).pipe(Effect.withSpan("destinations.deleteProjectDestinations")) as Effect.Effect<
    { readonly deleted: number },
    DeleteProjectDestinationsError,
    SqlClient | DestinationRepository | DestinationSourceStateRepository | DestinationSyncRunRepository
  >
