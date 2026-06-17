import type { QueuePublishError } from "@domain/queue"
import type { DestinationId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect, Ref } from "effect"
import type { DestinationSource } from "../entities/destination-source.ts"
import { DestinationRetentionPolicy } from "../ports/destination-retention-policy.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"

/** Fan-out callback, one per enabled source; wired to `QueuePublisher.publish` of the `backfill` job in the worker. */
export type RequestDestinationBackfillPublish = (job: {
  readonly source: DestinationSource
  readonly since: Date | null
  /** Upper bound — the source's current coverage start, so the import stops where live coverage begins. */
  readonly until: Date
}) => Effect.Effect<void, QueuePublishError>

export interface RequestDestinationBackfillInput {
  readonly destinationId: DestinationId
  /** Earliest instant to import from; `null` = as far back as the org retains. Retention is resolved later, in the worker's `backfillDestinationUseCase` — never trusted from here. */
  readonly since: Date | null
  readonly now: Date
  readonly publish: RequestDestinationBackfillPublish
}

export interface RequestDestinationBackfillResult {
  readonly requested: number
  readonly enqueued: number
  readonly failed: number
}

/**
 * Fans out a user-requested history import across a destination's **enabled**
 * sources by enqueuing one `backfill` job each — the worker then resolves
 * retention, clamps the reach, and drives every source's window chain. The
 * source set is derived here from the destination's state rows (not trusted from
 * the caller), so disabled sources are skipped — as are sources with nothing left
 * to import (`coverage_start_at` already at/below the retention floor), so a fully
 * imported destination enqueues no no-op jobs and reports `requested: 0`. `since`
 * is passed through untouched (the engine owns the TTL clamp), and per-source
 * publish failures are tallied, never fatal. The per-source dedupe key (set by the
 * publisher) makes a later manual retry idempotent.
 */
export const requestDestinationBackfillUseCase = (
  input: RequestDestinationBackfillInput,
): Effect.Effect<
  RequestDestinationBackfillResult,
  RepositoryError,
  SqlClient | DestinationSourceStateRepository | DestinationRetentionPolicy
> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("destination.id", input.destinationId)

    const sourceStates = yield* DestinationSourceStateRepository
    const enabled = (yield* sourceStates.listByDestinationId(input.destinationId)).filter((s) => s.status === "enabled")
    if (enabled.length === 0) return { requested: 0, enqueued: 0, failed: 0 }

    // Skip sources already imported to the retention floor — their backfill would be an empty no-op.
    const maxAgeMs = yield* (yield* DestinationRetentionPolicy).maxAgeMs(enabled[0].organizationId)
    const floor = input.now.getTime() - maxAgeMs
    const eligible = enabled.filter((s) => s.coverageStartAt.getTime() > floor)

    const enqueuedRef = yield* Ref.make(0)
    const failedRef = yield* Ref.make(0)

    yield* Effect.forEach(
      eligible,
      (state) =>
        input.publish({ source: state.source, since: input.since, until: state.coverageStartAt }).pipe(
          Effect.tap(() => Ref.update(enqueuedRef, (n) => n + 1)),
          Effect.catch(() => Ref.update(failedRef, (n) => n + 1)),
        ),
      { discard: true },
    )

    return {
      requested: eligible.length,
      enqueued: yield* Ref.get(enqueuedRef),
      failed: yield* Ref.get(failedRef),
    }
  }).pipe(Effect.withSpan("destinations.requestDestinationBackfill"))
