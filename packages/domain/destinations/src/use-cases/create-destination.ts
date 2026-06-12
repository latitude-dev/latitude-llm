import { isSandbox, OrganizationRepository } from "@domain/organizations"
import type {
  ConflictError,
  NotFoundError,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SqlClient,
  UserId,
} from "@domain/shared"
import { Effect } from "effect"
import type { Destination, DestinationConfig, DestinationCredentials } from "../entities/destination.ts"
import { createDestination } from "../entities/destination.ts"
import { SandboxOrganizationDestinationError } from "../errors.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"

export interface CreateDestinationInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly name: string
  readonly config: DestinationConfig
  readonly credentials: DestinationCredentials
  readonly createdByUserId: UserId
}

export type CreateDestinationError =
  | SandboxOrganizationDestinationError
  | NotFoundError
  | ConflictError
  | RepositoryError

/**
 * Creates an active destination with its cursor initialized to creation time
 * (new destinations sync forward only; backfill is a Phase 3 use case).
 * Sandbox/Test Mode organizations are rejected — sandbox data never leaves
 * the platform.
 */
export const createDestinationUseCase = (input: CreateDestinationInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("kind", input.config.kind)

    const organizations = yield* OrganizationRepository
    const organization = yield* organizations.findById(input.organizationId)
    if (isSandbox(organization)) {
      return yield* Effect.fail(new SandboxOrganizationDestinationError({ organizationId: input.organizationId }))
    }

    const destination = createDestination({
      organizationId: input.organizationId,
      projectId: input.projectId,
      name: input.name,
      config: input.config,
      credentials: input.credentials,
      createdByUserId: input.createdByUserId,
    })

    const destinations = yield* DestinationRepository
    yield* destinations.save(destination)

    return destination
  }).pipe(Effect.withSpan("destinations.createDestination")) as Effect.Effect<
    Destination,
    CreateDestinationError,
    SqlClient | DestinationRepository | OrganizationRepository
  >
