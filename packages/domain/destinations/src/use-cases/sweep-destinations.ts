import type { QueuePublishError } from "@domain/queue"
import type { OrganizationId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect, Ref } from "effect"
import type { Destination } from "../entities/destination.ts"
import type { DestinationSource } from "../entities/destination-source.ts"
import { DestinationSourceCursorRepository } from "../ports/destination-source-cursor-repository.ts"

const PUBLISH_CONCURRENCY = 10

/** Fan-out callback, one per due `(destination, source)` pair; wired to `QueuePublisher.publish` in the worker. */
export type SweepDestinationsPublish = (target: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly destination: Destination
  readonly source: DestinationSource
}) => Effect.Effect<void, QueuePublishError>

export interface SweepDestinationsResult {
  readonly due: number
  readonly published: number
  readonly failed: number
}

/**
 * Fan-out side of the every-minute sweep: selects due `(destination, source)`
 * cursor rows (idle backoff + sandbox exclusion live in `listDue`) and enqueues
 * one `runSync` per pair. The publish dedupe key (set by the worker, per
 * `(destination, source)`) keeps at most one run per pair queued. Per-pair
 * publish failures are tallied, never fatal.
 *
 * The sweep stays a single source-agnostic timer — per-source cadence is data
 * in the cursor row, not a separate timer. Audit-row pruning is its own nightly
 * job (`pruneDestinationSyncRunsUseCase`).
 *
 * The `destinations` feature flag is *not* re-checked: creation is UI-only and
 * flag-gated, and the runtime stop is `pause`, so the sweep runs every active
 * destination's sources the repository hands back.
 */
export const sweepDestinationsUseCase = (deps: {
  readonly now: Date
  readonly publish: SweepDestinationsPublish
}): Effect.Effect<SweepDestinationsResult, RepositoryError, SqlClient | DestinationSourceCursorRepository> =>
  Effect.gen(function* () {
    const cursors = yield* DestinationSourceCursorRepository

    const due = yield* cursors.listDue(deps.now)

    const failedRef = yield* Ref.make(0)
    const publishedRef = yield* Ref.make(0)

    yield* Effect.forEach(
      due,
      ({ destination, cursor }) =>
        deps
          .publish({
            organizationId: destination.organizationId,
            projectId: destination.projectId,
            destination,
            source: cursor.source,
          })
          .pipe(
            Effect.tap(() => Ref.update(publishedRef, (n) => n + 1)),
            Effect.catch(() => Ref.update(failedRef, (n) => n + 1)),
          ),
      { concurrency: PUBLISH_CONCURRENCY, discard: true },
    )

    const failed = yield* Ref.get(failedRef)
    const published = yield* Ref.get(publishedRef)

    yield* Effect.annotateCurrentSpan("due", due.length)
    yield* Effect.annotateCurrentSpan("published", published)
    yield* Effect.annotateCurrentSpan("failed", failed)

    return { due: due.length, published, failed } satisfies SweepDestinationsResult
  }).pipe(Effect.withSpan("destinations.sweep")) as Effect.Effect<
    SweepDestinationsResult,
    RepositoryError,
    SqlClient | DestinationSourceCursorRepository
  >
