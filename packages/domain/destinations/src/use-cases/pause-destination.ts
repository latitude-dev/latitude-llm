import type {
  ConflictError,
  DestinationId,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SqlClient,
} from "@domain/shared"
import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import type { Destination } from "../entities/destination.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"

export interface PauseDestinationInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly destinationId: DestinationId
}

export type PauseDestinationError = NotFoundError | ConflictError | RepositoryError

/** Pauses a destination so the sweep stops scheduling it. Cursor and counters are untouched. */
export const pauseDestinationUseCase = (input: PauseDestinationInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("destinationId", input.destinationId)

    const destinations = yield* DestinationRepository
    const current = yield* destinations.findById(input.destinationId)
    if (current.projectId !== input.projectId) {
      return yield* Effect.fail(new NotFoundError({ entity: "Destination", id: input.destinationId }))
    }
    if (current.status === "paused") return current

    const updated: Destination = { ...current, status: "paused", updatedAt: new Date() }
    yield* destinations.save(updated)
    return updated
  }).pipe(Effect.withSpan("destinations.pauseDestination")) as Effect.Effect<
    Destination,
    PauseDestinationError,
    SqlClient | DestinationRepository
  >
