import type { RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { DESTINATION_SYNC_RUN_RETENTION_MS } from "../constants.ts"
import { DestinationSyncRunRepository } from "../ports/destination-sync-run-repository.ts"

export interface PruneDestinationSyncRunsResult {
  readonly pruned: number
}

/**
 * Nightly retention GC for the `destination_sync_runs` audit table: deletes
 * rows finished more than {@link DESTINATION_SYNC_RUN_RETENTION_MS} ago. Cross-org
 * — the worker drives it through the admin Postgres client so RLS is bypassed.
 * Separate from the every-minute sweep because 30-day retention is coarse.
 */
export const pruneDestinationSyncRunsUseCase = (deps: {
  /** Injected for determinism; the worker passes wall-clock time. */
  readonly now: Date
}): Effect.Effect<PruneDestinationSyncRunsResult, RepositoryError, SqlClient | DestinationSyncRunRepository> =>
  Effect.gen(function* () {
    const syncRuns = yield* DestinationSyncRunRepository
    const cutoff = new Date(deps.now.getTime() - DESTINATION_SYNC_RUN_RETENTION_MS)
    const pruned = yield* syncRuns.pruneFinishedBefore(cutoff)
    yield* Effect.annotateCurrentSpan("pruned", pruned)
    return { pruned } satisfies PruneDestinationSyncRunsResult
  }).pipe(Effect.withSpan("destinations.pruneSyncRuns"))
