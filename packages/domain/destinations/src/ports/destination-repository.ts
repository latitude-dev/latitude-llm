import type { ConflictError, DestinationId, NotFoundError, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Destination, DestinationStatus } from "../entities/destination.ts"

/**
 * Destination-level failure/quarantine bookkeeping. Credentials and host are
 * shared across a destination's sources, so auth/host/transport failures are
 * destination faults: they live here, not on the per-source cursor. A successful
 * run resets the counter (`consecutiveFailures: 0`, `status: 'active'`).
 */
export interface UpdateDestinationQuarantineStateInput {
  readonly id: DestinationId
  readonly status: DestinationStatus
  readonly consecutiveFailures: number
  /** Sanitized: HTTP status + our error taxonomy, never upstream response bodies. */
  readonly lastFailureMessage: string | null
}

export interface DestinationRepositoryShape {
  /** Insert-or-update by id; fails with `ConflictError` when another destination holds the `(project_id, kind)` unique key. */
  save(destination: Destination): Effect.Effect<void, ConflictError | RepositoryError, SqlClient>
  /** Loads a destination by id within the caller's organization; fails with `NotFoundError` when absent. */
  findById(id: DestinationId): Effect.Effect<Destination, NotFoundError | RepositoryError, SqlClient>
  /** Destinations configured for a project within the caller's organization, newest first. */
  listByProjectId(projectId: ProjectId): Effect.Effect<readonly Destination[], RepositoryError, SqlClient>
  /** Hard-deletes a destination by id within the caller's organization. Source cursors cascade separately. */
  delete(id: DestinationId): Effect.Effect<void, RepositoryError, SqlClient>
  /**
   * Persists destination-level failure/quarantine bookkeeping. Never touches a
   * source cursor — those move only through the cursor repository's optimistic
   * advance, so a stale run cannot drag a cursor while recording a failure.
   */
  updateQuarantineState(input: UpdateDestinationQuarantineStateInput): Effect.Effect<void, RepositoryError, SqlClient>
  updateStatus(input: {
    readonly id: DestinationId
    readonly status: DestinationStatus
  }): Effect.Effect<void, RepositoryError, SqlClient>
  deleteByProjectId(projectId: ProjectId): Effect.Effect<readonly DestinationId[], RepositoryError, SqlClient>
}

export class DestinationRepository extends Context.Service<DestinationRepository, DestinationRepositoryShape>()(
  "@domain/destinations/DestinationRepository",
) {}
