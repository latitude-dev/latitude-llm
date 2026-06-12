import type { ConflictError, DestinationId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Destination } from "../entities/destination.ts"

/** Position in the `(ingested_at, span_id)` compound cursor. `spanId` is `""` before the first advance. */
export interface DestinationCursor {
  readonly ingestedAt: Date
  readonly spanId: string
}

export interface AdvanceDestinationCursorInput {
  readonly id: DestinationId
  /** The cursor the run started from; the write only applies while the row still holds it. */
  readonly expected: DestinationCursor
  readonly next: DestinationCursor
}

export interface DestinationRepositoryShape {
  /** Insert-or-update by id; fails with `ConflictError` when another destination holds the `(project_id, kind)` unique key. */
  save(destination: Destination): Effect.Effect<void, ConflictError | RepositoryError, SqlClient>
  /**
   * Active destinations due for a sync at `now`: idle backoff applied as
   * `last_run_at + intervalMs × 2^consecutive_empty_runs ≤ now` (never-ran rows
   * are always due), sandbox organizations excluded. Cross-org by design —
   * drive through the admin Postgres client so RLS is bypassed; the sweep
   * filters flag-off organizations itself.
   */
  listDue(now: Date): Effect.Effect<readonly Destination[], RepositoryError, SqlClient>
  /**
   * Optimistic compound-cursor advance: applies only while the row still holds
   * `expected`, returning whether the write claimed. A stale concurrent run can
   * never move the cursor backwards or double-advance it.
   */
  advanceCursor(input: AdvanceDestinationCursorInput): Effect.Effect<boolean, RepositoryError, SqlClient>
  deleteByProjectId(projectId: ProjectId): Effect.Effect<readonly DestinationId[], RepositoryError, SqlClient>
}

export class DestinationRepository extends Context.Service<DestinationRepository, DestinationRepositoryShape>()(
  "@domain/destinations/DestinationRepository",
) {}
