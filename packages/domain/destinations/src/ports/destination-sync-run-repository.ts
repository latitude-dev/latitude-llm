import type { DestinationId, DestinationSyncRunId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { DestinationSyncRun } from "../entities/destination-sync-run.ts"

/**
 * Keyset position in the `(started_at DESC, id DESC)` ordering. "Load more"
 * passes the last row of the page to fetch strictly-older runs — no offset,
 * so pages stay stable as new runs land at the head.
 */
export interface DestinationSyncRunCursor {
  readonly startedAt: Date
  readonly id: DestinationSyncRunId
}

export interface ListSyncRunsByDestinationIdInput {
  readonly destinationId: DestinationId
  readonly limit: number
  /** When set, return only runs ordered strictly after this position. */
  readonly before?: DestinationSyncRunCursor
}

export interface DestinationSyncRunRepositoryShape {
  insert(run: DestinationSyncRun): Effect.Effect<void, RepositoryError, SqlClient>
  listByDestinationId(
    input: ListSyncRunsByDestinationIdInput,
  ): Effect.Effect<readonly DestinationSyncRun[], RepositoryError, SqlClient>
  deleteByDestinationIds(ids: readonly DestinationId[]): Effect.Effect<void, RepositoryError, SqlClient>
  /**
   * Prunes runs finished before `cutoff`, returning the pruned count.
   * Cross-org by design — the nightly `pruneSyncRuns` job drives it through the
   * admin Postgres client so RLS is bypassed.
   */
  pruneFinishedBefore(cutoff: Date): Effect.Effect<number, RepositoryError, SqlClient>
}

export class DestinationSyncRunRepository extends Context.Service<
  DestinationSyncRunRepository,
  DestinationSyncRunRepositoryShape
>()("@domain/destinations/DestinationSyncRunRepository") {}
