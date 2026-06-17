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
import type { Destination, DestinationConfigPatch, DestinationCredentials } from "../entities/destination.ts"
import { destinationConfigSchema, destinationSchema } from "../entities/destination.ts"
import type { DestinationSourceConfigPatch } from "../entities/destination-source.ts"
import { destinationSourceConfigSchema } from "../entities/destination-source.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"

export interface UpdateDestinationInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly destinationId: DestinationId
  readonly name?: string | undefined
  /** Partial config merged onto the stored config — omitted fields (e.g. intervalMs) are preserved, not reset. */
  readonly config?: DestinationConfigPatch | undefined
  readonly credentials?: DestinationCredentials | undefined
  /** Per-source config patches, merged onto each source's stored config in the same transaction as the destination update. */
  readonly sourceConfigs?: readonly DestinationSourceConfigPatch[] | undefined
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

    // Merge the patch onto the stored config so omitted fields (e.g. intervalMs, which has no UI) are preserved.
    const nextConfig = input.config
      ? destinationConfigSchema.parse({ ...current.config, ...input.config })
      : current.config
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
        if (input.sourceConfigs && input.sourceConfigs.length > 0) {
          const currentSources = yield* sourceStates.listByDestinationId(updated.id)
          for (const patch of input.sourceConfigs) {
            const current = currentSources.find((s) => s.source === patch.source)
            if (!current) continue
            // Merge onto the stored source config so omitted fields (e.g. maxRecordsPerRun, no UI) are preserved.
            const config = destinationSourceConfigSchema.parse({ ...current.config, ...patch })
            yield* sourceStates.updateConfig({ destinationId: updated.id, source: patch.source, config })
          }
        }
      }),
    )
    return updated
  }).pipe(Effect.withSpan("destinations.updateDestination")) as Effect.Effect<
    Destination,
    UpdateDestinationError,
    SqlClient | DestinationRepository | DestinationSourceStateRepository
  >
