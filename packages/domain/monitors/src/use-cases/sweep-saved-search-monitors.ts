import type { QueuePublishError } from "@domain/queue"
import type { RepositoryError, SqlClient } from "@domain/shared"
import { Effect, Ref } from "effect"
import { MonitorRepository } from "../ports/monitor-repository.ts"

const PUBLISH_CONCURRENCY = 10

/** Publish callback, one per (org, project); wired to `QueuePublisher.publish` in the worker. */
export type SweepSavedSearchMonitorsPublish = (payload: {
  readonly organizationId: string
  readonly projectId: string
}) => Effect.Effect<void, QueuePublishError>

export interface SweepSavedSearchMonitorsResult {
  readonly attempted: number
  readonly published: number
  readonly failed: number
}

/**
 * Fan-out side of the 5-minute sweep: enqueues one `checkSavedSearchMonitors` per
 * (org, project) with an active alert (cross-org, admin client). Catches the
 * low-traffic case the trace-end check misses — opening incidents and letting
 * sustained ones close once their dwell elapses. Per-project failures are tallied.
 */
export const sweepSavedSearchMonitorsUseCase = (deps: {
  readonly publish: SweepSavedSearchMonitorsPublish
}): Effect.Effect<SweepSavedSearchMonitorsResult, RepositoryError, SqlClient | MonitorRepository> =>
  Effect.gen(function* () {
    const monitorRepository = yield* MonitorRepository
    const projects = yield* monitorRepository.listProjectsWithActiveSavedSearchAlerts()

    const failedRef = yield* Ref.make(0)
    yield* Effect.forEach(
      projects,
      (project) =>
        deps
          .publish({ organizationId: project.organizationId, projectId: project.projectId })
          .pipe(Effect.catch(() => Ref.update(failedRef, (n) => n + 1))),
      { concurrency: PUBLISH_CONCURRENCY, discard: true },
    )

    const failed = yield* Ref.get(failedRef)
    const attempted = projects.length
    const published = attempted - failed

    yield* Effect.annotateCurrentSpan("attempted", attempted)
    yield* Effect.annotateCurrentSpan("published", published)
    yield* Effect.annotateCurrentSpan("failed", failed)

    return { attempted, published, failed } satisfies SweepSavedSearchMonitorsResult
  }).pipe(Effect.withSpan("monitors.sweepSavedSearchMonitors")) as Effect.Effect<
    SweepSavedSearchMonitorsResult,
    RepositoryError,
    SqlClient | MonitorRepository
  >
