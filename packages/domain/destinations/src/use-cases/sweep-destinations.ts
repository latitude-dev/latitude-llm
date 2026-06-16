import type { QueuePublishError } from "@domain/queue"
import type { OrganizationId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect, Ref } from "effect"
import type { Destination } from "../entities/destination.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"

const PUBLISH_CONCURRENCY = 10

/** Fan-out callback, one per due destination; wired to `QueuePublisher.publish` in the worker. */
export type SweepDestinationsPublish = (target: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly destination: Destination
}) => Effect.Effect<void, QueuePublishError>

export interface SweepDestinationsResult {
  readonly due: number
  readonly published: number
  readonly failed: number
}

/**
 * Fan-out side of the every-minute sweep: selects due destinations (idle
 * backoff + sandbox exclusion live in `listDue`) and enqueues one `runSync`
 * per destination. The publish dedupe key (set by the worker) keeps at most one
 * run per destination queued. Per-destination publish failures are tallied,
 * never fatal.
 *
 * Audit-row pruning is *not* here — it's a separate nightly job
 * (`pruneDestinationSyncRunsUseCase`), since 30-day retention has no reason to
 * run on the every-minute cadence.
 *
 * The `destinations` feature flag is *not* re-checked: creation is UI-only and
 * flag-gated, and the runtime stop is `pause` (by the customer in settings or
 * by an operator via backoffice), so the sweep runs every active destination
 * the repository hands back.
 */
export const sweepDestinationsUseCase = (deps: {
  readonly now: Date
  readonly publish: SweepDestinationsPublish
}): Effect.Effect<SweepDestinationsResult, RepositoryError, SqlClient | DestinationRepository> =>
  Effect.gen(function* () {
    const destinations = yield* DestinationRepository

    const due = yield* destinations.listDue(deps.now)

    const failedRef = yield* Ref.make(0)
    const publishedRef = yield* Ref.make(0)

    yield* Effect.forEach(
      due,
      (destination) =>
        deps
          .publish({
            organizationId: destination.organizationId,
            projectId: destination.projectId,
            destination,
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
    SqlClient | DestinationRepository
  >
