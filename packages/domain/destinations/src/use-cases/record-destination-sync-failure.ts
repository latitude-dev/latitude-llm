import type { DestinationId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { DESTINATION_QUARANTINE_FAILURE_THRESHOLD } from "../constants.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"

export interface RecordDestinationSyncFailureInput {
  readonly destinationId: DestinationId
  /** Injected for determinism; the worker passes wall-clock time. */
  readonly now: Date
  /** Sanitized failure message: HTTP status + our taxonomy, never upstream response bodies. */
  readonly message: string
}

export interface RecordDestinationSyncFailureResult {
  readonly outcome: "recorded" | "quarantined" | "skipped"
  readonly consecutiveFailures: number
}

/**
 * Terminal-failure accounting for a `runSync` job that exhausted its BullMQ
 * retries. Mirrors the non-retryable branch of {@link runDestinationSyncUseCase}:
 * one terminal failure of any kind increments `consecutive_failures` and
 * quarantines at the threshold, so a chronically unreachable host stops being
 * scheduled instead of retrying forever. The cursor is never touched. A
 * destination that is no longer active (paused, already quarantined, or deleted
 * mid-retry) is left untouched.
 */
export const recordDestinationSyncFailureUseCase = (
  input: RecordDestinationSyncFailureInput,
): Effect.Effect<RecordDestinationSyncFailureResult, RepositoryError, SqlClient | DestinationRepository> =>
  Effect.gen(function* () {
    const destinations = yield* DestinationRepository
    const destination = yield* destinations
      .findById(input.destinationId)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    if (!destination || destination.status !== "active") {
      return { outcome: "skipped", consecutiveFailures: destination?.consecutiveFailures ?? 0 } as const
    }

    const consecutiveFailures = destination.consecutiveFailures + 1
    const quarantined = consecutiveFailures >= DESTINATION_QUARANTINE_FAILURE_THRESHOLD

    yield* destinations.updateRunState({
      id: destination.id,
      status: quarantined ? "quarantined" : "active",
      consecutiveFailures,
      consecutiveEmptyRuns: destination.consecutiveEmptyRuns,
      lastFailureMessage: input.message,
      lastRunAt: input.now,
    })

    return { outcome: quarantined ? "quarantined" : "recorded", consecutiveFailures } as const
  }).pipe(Effect.withSpan("destinations.recordSyncFailure"))
