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

export interface ResumeDestinationInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly destinationId: DestinationId
}

export type ResumeDestinationError = NotFoundError | ConflictError | RepositoryError

/**
 * Resumes a paused destination back to `active`. The cursor is left untouched —
 * the backlog catches up through the normal capped runs. Quarantine is not
 * cleared here; that path is editing credentials or host via {@link updateDestinationUseCase}.
 */
export const resumeDestinationUseCase = (input: ResumeDestinationInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("destinationId", input.destinationId)

    const destinations = yield* DestinationRepository
    const current = yield* destinations.findById(input.destinationId)
    if (current.projectId !== input.projectId) {
      return yield* Effect.fail(new NotFoundError({ entity: "Destination", id: input.destinationId }))
    }
    if (current.status === "active") return current

    const updated: Destination = { ...current, status: "active", updatedAt: new Date() }
    yield* destinations.save(updated)
    return updated
  }).pipe(Effect.withSpan("destinations.resumeDestination")) as Effect.Effect<
    Destination,
    ResumeDestinationError,
    SqlClient | DestinationRepository
  >
