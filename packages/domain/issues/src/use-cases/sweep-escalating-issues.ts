import { AlertIncidentRepository } from "@domain/alerts"
import type { QueuePublishError } from "@domain/queue"
import type { RepositoryError, SqlClient } from "@domain/shared"
import { Effect, Ref } from "effect"

/**
 * Concurrency cap for the per-incident publish fan-out. Mirrors the
 * `fanOutWeeklyRunUseCase` cap — the publish path is cheap, but a hard cap
 * keeps a single sweep tick from saturating the queue if the set of open
 * incidents ever grows unexpectedly.
 */
const PUBLISH_CONCURRENCY = 10

/**
 * Callback the use case invokes for each open `issue.escalating` incident.
 * The worker wires this to
 * `QueuePublisher.publish("issues", "checkEscalation", payload, ...)`; tests
 * substitute a capture function.
 */
export type SweepEscalatingIssuesPublish = (payload: {
  readonly organizationId: string
  readonly projectId: string
  readonly issueId: string
}) => Effect.Effect<void, QueuePublishError>

interface SweepEscalatingIssuesDeps {
  readonly publish: SweepEscalatingIssuesPublish
}

export interface SweepEscalatingIssuesResult {
  readonly attempted: number
  readonly published: number
  readonly failed: number
}

/**
 * Fan-out side of the hourly escalation sweep. The cron fires once an hour;
 * this use case reads every open `issue.escalating` row across the platform
 * (via the admin Postgres client → RLS bypass) and enqueues one
 * `checkEscalation` task per incident.
 *
 * Why this exists: `ScoreAssignedToIssue`-driven checks only fire when new
 * scores arrive on the issue. If a burst opens an incident and then
 * scoring stops, the one debounced recheck at T+1h often sees the burst
 * still inside the 6h window and decides "still escalating", and no further
 * event ever arrives to trigger a recheck. The sweep guarantees every open
 * row gets reconsidered at least hourly, so the band-shape exit (after
 * dwell), the absolute-rate-drop backstop, and the 72h timeout all
 * actually fire on quiet incidents.
 *
 * Per-incident publish failures are caught and tallied into `failed` so a
 * single bad publish doesn't abort the remaining rows on the same tick.
 * The caller decides how loudly to log a non-zero `failed` count.
 *
 * The publish step is a callback so the use case stays decoupled from the
 * queue adapter — tests pass a capture function.
 */
export const sweepEscalatingIssuesUseCase = (deps: SweepEscalatingIssuesDeps) =>
  Effect.gen(function* () {
    const alertIncidentRepository = yield* AlertIncidentRepository
    const incidents = yield* alertIncidentRepository.listOpenByKind("issue.escalating")

    const failedRef = yield* Ref.make(0)

    yield* Effect.forEach(
      incidents,
      (incident) =>
        deps
          .publish({
            organizationId: incident.organizationId,
            projectId: incident.projectId,
            issueId: incident.sourceId,
          })
          .pipe(Effect.catch(() => Ref.update(failedRef, (n) => n + 1))),
      { concurrency: PUBLISH_CONCURRENCY, discard: true },
    )

    const failed = yield* Ref.get(failedRef)
    const attempted = incidents.length
    const published = attempted - failed

    yield* Effect.annotateCurrentSpan("attempted", attempted)
    yield* Effect.annotateCurrentSpan("published", published)
    yield* Effect.annotateCurrentSpan("failed", failed)

    return { attempted, published, failed } satisfies SweepEscalatingIssuesResult
  }).pipe(Effect.withSpan("issues.sweepEscalatingIssues")) as Effect.Effect<
    SweepEscalatingIssuesResult,
    RepositoryError,
    SqlClient | AlertIncidentRepository
  >
