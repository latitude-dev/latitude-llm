import type { DestinationId, OrganizationId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { DestinationSource } from "../entities/destination-source.ts"
import { createDestinationSyncRun } from "../entities/destination-sync-run.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"
import { DestinationSyncRunRepository } from "../ports/destination-sync-run-repository.ts"

export interface RecordBackfillFailureInput {
  readonly organizationId: OrganizationId
  readonly destinationId: DestinationId
  readonly source: DestinationSource
  /** The window the dead chain was on — its resume cursor (lower) and segment end (upper). */
  readonly windowStart: Date
  readonly windowEnd: Date
  /** Sanitized failure message (HTTP status + our taxonomy), never an upstream body. */
  readonly message: string
  readonly now: Date
}

/**
 * Terminal-failure accounting for a backfill chain. A backfill window only writes
 * a sync-run row on *success* (and never quarantines), so a chain that exhausts its
 * retries would otherwise vanish silently — invisible in the run history, with the
 * in-flight marker still set. This writes a single `failed` backfill run row (so the
 * failure surfaces in run history exactly like a live-sync failure) and clears the
 * marker (so the UI stops showing "Backfilling…"). Called from the worker's
 * `onFinalFailure` for `runBackfillWindow`. Unlike the live path it does **no**
 * consecutive-failure / quarantine accounting — a heavy backfill never takes down
 * live sync.
 */
export const recordBackfillFailureUseCase = (
  input: RecordBackfillFailureInput,
): Effect.Effect<void, RepositoryError, SqlClient | DestinationSyncRunRepository | DestinationSourceStateRepository> =>
  Effect.gen(function* () {
    const syncRuns = yield* DestinationSyncRunRepository
    const sourceStates = yield* DestinationSourceStateRepository

    const run = createDestinationSyncRun({
      organizationId: input.organizationId,
      destinationId: input.destinationId,
      source: input.source,
      trigger: "backfill",
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      status: "failed",
      recordsRead: 0,
      eventsSent: 0,
      eventsDropped: 0,
      error: input.message,
      startedAt: input.now,
      finishedAt: input.now,
    })
    yield* syncRuns.insert(run)
    yield* sourceStates.setBackfillStartedAt({ destinationId: input.destinationId, source: input.source, at: null })
  }).pipe(Effect.withSpan("destinations.recordBackfillFailure"))
