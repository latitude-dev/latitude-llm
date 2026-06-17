import {
  type DestinationId,
  NotFoundError,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  SqlClient,
} from "@domain/shared"
import { Effect } from "effect"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"
import { DestinationSyncRunRepository } from "../ports/destination-sync-run-repository.ts"

export interface DeleteDestinationInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly destinationId: DestinationId
}

export type DeleteDestinationError = NotFoundError | RepositoryError

/** Hard-deletes a destination and its sync-run history. The cursor history goes with the row. */
export const deleteDestinationUseCase = (input: DeleteDestinationInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("destinationId", input.destinationId)

    const destinations = yield* DestinationRepository
    const current = yield* destinations.findById(input.destinationId)
    if (current.projectId !== input.projectId) {
      return yield* Effect.fail(new NotFoundError({ entity: "Destination", id: input.destinationId }))
    }

    const syncRuns = yield* DestinationSyncRunRepository
    const cursors = yield* DestinationSourceStateRepository
    const sqlClient = yield* SqlClient
    yield* sqlClient.transaction(
      Effect.gen(function* () {
        yield* syncRuns.deleteByDestinationIds([input.destinationId])
        yield* cursors.deleteByDestinationId(input.destinationId)
        yield* destinations.delete(input.destinationId)
      }),
    )
  }).pipe(Effect.withSpan("destinations.deleteDestination")) as Effect.Effect<
    void,
    DeleteDestinationError,
    SqlClient | DestinationRepository | DestinationSourceStateRepository | DestinationSyncRunRepository
  >
