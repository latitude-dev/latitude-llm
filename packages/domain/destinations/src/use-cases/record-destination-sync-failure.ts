import type { DestinationId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { DESTINATION_QUARANTINE_FAILURE_THRESHOLD } from "../constants.ts"
import type { DestinationSource } from "../entities/destination-source.ts"
import { type DeliveryErrorReason, isThrottlingDeliveryReason } from "../errors.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"
import type { DestinationQuarantineEvent } from "./run-destination-sync.ts"

export interface RecordDestinationSyncFailureInput {
  readonly destinationId: DestinationId
  readonly source: DestinationSource
  /** Injected for determinism; the worker passes wall-clock time. */
  readonly now: Date
  /** Sanitized failure message: HTTP status + our taxonomy, never upstream response bodies. */
  readonly message: string
  /** Typed reason from the exhausted delivery error. `rate_limited` backs off instead of counting toward quarantine. */
  readonly reason?: DeliveryErrorReason
}

export interface RecordDestinationSyncFailureResult {
  readonly outcome: "recorded" | "quarantined" | "throttled" | "skipped"
  readonly consecutiveFailures: number
  /** Set only on the call that flips the destination to quarantined; null otherwise. */
  readonly quarantineEvent: DestinationQuarantineEvent | null
}

/**
 * Terminal-failure accounting for a `runSync` job that exhausted its BullMQ
 * retries. Mirrors the non-retryable branch of {@link runDestinationSyncUseCase}:
 * one terminal failure increments the destination's `consecutive_failures` and
 * quarantines at the threshold, so a chronically unreachable host stops being
 * scheduled instead of retrying forever. A throttle reason (`rate_limited`) is
 * the exception — the destination is healthy and the upstream is throttling, so
 * the failure does not count toward quarantine; the run still fails its window
 * and the sweep re-enqueues next interval. The cursor position is never touched,
 * but the source's `last_run_at` is bumped so the sweep doesn't immediately
 * re-enqueue the just-failed pair. A destination that is no longer active
 * (paused, already quarantined, or deleted mid-retry) is left untouched.
 */
export const recordDestinationSyncFailureUseCase = (
  input: RecordDestinationSyncFailureInput,
): Effect.Effect<
  RecordDestinationSyncFailureResult,
  RepositoryError,
  SqlClient | DestinationRepository | DestinationSourceStateRepository
> =>
  Effect.gen(function* () {
    const destinations = yield* DestinationRepository
    const destination = yield* destinations
      .findById(input.destinationId)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    if (!destination || destination.status !== "active") {
      return {
        outcome: "skipped",
        consecutiveFailures: destination?.consecutiveFailures ?? 0,
        quarantineEvent: null,
      } as const
    }

    const throttled = input.reason !== undefined && isThrottlingDeliveryReason(input.reason)
    const consecutiveFailures = throttled ? destination.consecutiveFailures : destination.consecutiveFailures + 1
    const quarantined = !throttled && consecutiveFailures >= DESTINATION_QUARANTINE_FAILURE_THRESHOLD

    yield* destinations.updateQuarantineState({
      id: destination.id,
      status: quarantined ? "quarantined" : "active",
      consecutiveFailures,
      lastFailureMessage: input.message,
    })

    const cursors = yield* DestinationSourceStateRepository
    const cursor = yield* cursors.findByDestinationAndSource({
      destinationId: destination.id,
      source: input.source,
    })
    if (cursor) {
      yield* cursors.updateRunState({
        destinationId: destination.id,
        source: input.source,
        consecutiveEmptyRuns: cursor.consecutiveEmptyRuns,
        lastRunAt: input.now,
      })
    }

    return {
      outcome: quarantined ? "quarantined" : throttled ? "throttled" : "recorded",
      consecutiveFailures,
      quarantineEvent: quarantined
        ? {
            organizationId: destination.organizationId,
            projectId: destination.projectId,
            destinationId: destination.id,
            destinationName: destination.name,
            destinationKind: destination.kind,
            failureMessage: input.message,
            quarantinedAt: input.now,
          }
        : null,
    } as const
  }).pipe(Effect.withSpan("destinations.recordSyncFailure"))
