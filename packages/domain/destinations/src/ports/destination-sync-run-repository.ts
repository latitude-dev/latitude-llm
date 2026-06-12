import type { DestinationId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { DestinationSyncRun } from "../entities/destination-sync-run.ts"

export interface ListSyncRunsByDestinationIdInput {
  readonly destinationId: DestinationId
  readonly limit: number
}

export interface DestinationSyncRunRepositoryShape {
  insert(run: DestinationSyncRun): Effect.Effect<void, RepositoryError, SqlClient>
  listByDestinationId(
    input: ListSyncRunsByDestinationIdInput,
  ): Effect.Effect<readonly DestinationSyncRun[], RepositoryError, SqlClient>
  deleteByDestinationIds(ids: readonly DestinationId[]): Effect.Effect<void, RepositoryError, SqlClient>
  /**
   * Prunes runs finished before `cutoff`, returning the pruned count.
   * Cross-org by design — the sweep drives it through the admin Postgres
   * client so RLS is bypassed.
   */
  pruneFinishedBefore(cutoff: Date): Effect.Effect<number, RepositoryError, SqlClient>
}

export class DestinationSyncRunRepository extends Context.Service<
  DestinationSyncRunRepository,
  DestinationSyncRunRepositoryShape
>()("@domain/destinations/DestinationSyncRunRepository") {}
