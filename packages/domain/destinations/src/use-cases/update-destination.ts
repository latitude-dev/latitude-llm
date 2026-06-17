import {
  type ConflictError,
  type DestinationId,
  NotFoundError,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  SqlClient,
  ValidationError,
} from "@domain/shared"
import { Effect } from "effect"
import type { Destination, DestinationConfig, DestinationCredentials } from "../entities/destination.ts"
import { destinationSchema } from "../entities/destination.ts"
import type { DestinationSourceConfig } from "../entities/destination-source.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"

export interface UpdateDestinationInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly destinationId: DestinationId
  readonly name?: string | undefined
  readonly config?: DestinationConfig | undefined
  readonly credentials?: DestinationCredentials | undefined
  /** Per-source config edits applied in the same transaction as the destination update. */
  readonly sourceConfigs?: readonly DestinationSourceConfig[] | undefined
}

export type UpdateDestinationError = NotFoundError | ValidationError | ConflictError | RepositoryError

// Key-order-insensitive value serialization so the credentials comparison
// holds for any kind regardless of how the object was constructed or stored.
const canonicalize = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )

/**
 * Updates a destination's name, config, credentials, and per-source config in a
 * single transaction (the edit form saves both at once — never half-applied).
 * Editing the credentials or the delivery host resets the failure counter and
 * lifts quarantine (the reconnect path); the sync cursor is never touched.
 */
export const updateDestinationUseCase = (input: UpdateDestinationInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("destinationId", input.destinationId)

    const destinations = yield* DestinationRepository
    const sourceStates = yield* DestinationSourceStateRepository
    const sqlClient = yield* SqlClient

    const current = yield* destinations.findById(input.destinationId)
    if (current.projectId !== input.projectId) {
      return yield* Effect.fail(new NotFoundError({ entity: "Destination", id: input.destinationId }))
    }

    const nextConfig = input.config ?? current.config
    const nextCredentials = input.credentials ?? current.credentials
    if (nextConfig.kind !== current.kind || nextCredentials.kind !== current.kind) {
      return yield* Effect.fail(new ValidationError({ field: "kind", message: "Destination kind cannot be changed" }))
    }

    const credentialsChanged = canonicalize(nextCredentials) !== canonicalize(current.credentials)
    const hostChanged = nextConfig.host !== current.config.host
    const resetsFailures = credentialsChanged || hostChanged

    const updated: Destination = destinationSchema.parse({
      ...current,
      name: input.name ?? current.name,
      config: nextConfig,
      credentials: nextCredentials,
      status: resetsFailures && current.status === "quarantined" ? "active" : current.status,
      consecutiveFailures: resetsFailures ? 0 : current.consecutiveFailures,
      lastFailureMessage: resetsFailures ? null : current.lastFailureMessage,
      updatedAt: new Date(),
    })

    yield* sqlClient.transaction(
      Effect.gen(function* () {
        yield* destinations.save(updated)
        for (const config of input.sourceConfigs ?? []) {
          yield* sourceStates.updateConfig({ destinationId: updated.id, source: config.source, config })
        }
      }),
    )
    return updated
  }).pipe(Effect.withSpan("destinations.updateDestination")) as Effect.Effect<
    Destination,
    UpdateDestinationError,
    SqlClient | DestinationRepository | DestinationSourceStateRepository
  >
