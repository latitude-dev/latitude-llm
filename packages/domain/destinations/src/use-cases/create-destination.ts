import { isSandbox, OrganizationRepository } from "@domain/organizations"
import {
  type ConflictError,
  type NotFoundError,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  SqlClient,
  type UserId,
} from "@domain/shared"
import { Effect } from "effect"
import type { Destination, DestinationConfig, DestinationCredentials } from "../entities/destination.ts"
import { createDestination, supportedSourcesForKind } from "../entities/destination.ts"
import { type DestinationSourceConfig, defaultSourceConfig } from "../entities/destination-source.ts"
import { createDestinationSourceState } from "../entities/destination-source-state.ts"
import { SandboxOrganizationDestinationError } from "../errors.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"

export interface CreateDestinationInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly name: string
  readonly config: DestinationConfig
  readonly credentials: DestinationCredentials
  readonly createdByUserId: UserId
  /** Per-source config overrides keyed by source; sources without an entry seed with defaults. */
  readonly sourceConfigs?: readonly DestinationSourceConfig[]
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
    const sourceStates = yield* DestinationSourceStateRepository
    const sqlClient = yield* SqlClient

    yield* sqlClient.transaction(
      Effect.gen(function* () {
        yield* destinations.save(destination)
        // Seed one enabled row per source this kind supports (v1: spans). Watermark = creation time → forward-only sync.
        for (const source of supportedSourcesForKind(destination.kind)) {
          const config = input.sourceConfigs?.find((c) => c.source === source) ?? defaultSourceConfig(source)
          yield* sourceStates.create(
            createDestinationSourceState({
              organizationId: destination.organizationId,
              destinationId: destination.id,
              source,
              config,
              watermark: destination.createdAt,
            }),
          )
        }
      }),
    )

    return destination
  }).pipe(Effect.withSpan("destinations.createDestination")) as Effect.Effect<
    Destination,
    CreateDestinationError,
    SqlClient | DestinationRepository | DestinationSourceStateRepository | OrganizationRepository
  >
