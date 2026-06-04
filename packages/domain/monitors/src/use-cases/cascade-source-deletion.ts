import type { AlertIncidentSourceType, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { type CascadeSourceDeletionResult, MonitorRepository } from "../ports/monitor-repository.ts"

export interface CascadeSourceDeletionInput {
  readonly sourceType: AlertIncidentSourceType
  readonly sourceId: string
}

/**
 * Handle a deleted source (today: a saved search): soft-delete its alerts, close
 * their open incidents, and prune emptied monitors (see `cascadeSourceDeletion`).
 * Idempotent. Issue sources need no cascade — issue alerts are system-only with
 * `source.id = null`, so deleting one issue never orphans an alert.
 */
export const cascadeSourceDeletionUseCase = (
  input: CascadeSourceDeletionInput,
): Effect.Effect<CascadeSourceDeletionResult, RepositoryError, SqlClient | MonitorRepository> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("sourceType", input.sourceType)
    yield* Effect.annotateCurrentSpan("sourceId", input.sourceId)
    const monitorRepository = yield* MonitorRepository
    return yield* monitorRepository.cascadeSourceDeletion(input)
  }).pipe(Effect.withSpan("monitors.cascadeSourceDeletion"))
