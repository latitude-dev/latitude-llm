import type { ConflictError, DestinationId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Destination, DestinationStatus } from "../entities/destination.ts"

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

/** Post-run bookkeeping (status, counters, `last_run_at`) — never the cursor. */
export interface UpdateDestinationRunStateInput {
  readonly id: DestinationId
  readonly status: DestinationStatus
  readonly consecutiveFailures: number
  readonly consecutiveEmptyRuns: number
  /** Sanitized: HTTP status + our error taxonomy, never upstream response bodies. */
  readonly lastFailureMessage: string | null
  readonly lastRunAt: Date
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
  /**
   * Persists post-run bookkeeping without touching the cursor columns — the
   * cursor moves only through the optimistic {@link advanceCursor}. Keeping the
   * two writes separate is what stops a stale run from dragging the cursor
   * backwards while it records its failure or idle counters.
   */
  updateRunState(input: UpdateDestinationRunStateInput): Effect.Effect<void, RepositoryError, SqlClient>
  deleteByProjectId(projectId: ProjectId): Effect.Effect<readonly DestinationId[], RepositoryError, SqlClient>
}

export class DestinationRepository extends Context.Service<DestinationRepository, DestinationRepositoryShape>()(
  "@domain/destinations/DestinationRepository",
) {}
