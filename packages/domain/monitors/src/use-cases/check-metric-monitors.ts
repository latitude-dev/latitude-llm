import type { AlertIncidentRepository } from "@domain/alerts"
import { SavedSearchRepository } from "@domain/saved-searches"
import {
  type ChSqlClient,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  SavedSearchId,
  type SqlClient,
} from "@domain/shared"
import { Cause, Effect } from "effect"
import type { MonitorTarget } from "../entities/monitor.ts"
import type { MetricSeriesReader, MetricSeriesTarget } from "../ports/metric-series-reader.ts"
import { type MetricMonitorAlert, MonitorRepository } from "../ports/monitor-repository.ts"
import { runMetricMonitorAlertUseCase } from "./run-metric-monitor-alert.ts"

export interface CheckMetricMonitorsInput {
  readonly organizationId: string
  readonly projectId: string
}

export interface CheckMetricMonitorsResult {
  readonly evaluated: number
  readonly failed: number
}

/** Resolve a persisted monitor target to the reader's `(stream, filterSet, query, metric)`: a saved-search reference loads its live predicate; otherwise the inline filterSet/query apply. */
const resolveTarget = (target: MonitorTarget) =>
  Effect.gen(function* () {
    if (target.savedSearchId !== null) {
      const search = yield* (yield* SavedSearchRepository)
        .findById(SavedSearchId(target.savedSearchId))
        .pipe(Effect.catchTag("SavedSearchNotFoundError", () => Effect.succeed(null)))
      if (search === null) return null
      return {
        stream: target.stream,
        filterSet: search.filterSet,
        query: search.query,
        metric: target.metric,
      } satisfies MetricSeriesTarget
    }
    return {
      stream: target.stream,
      filterSet: target.filterSet ?? {},
      query: target.query,
      metric: target.metric,
    } satisfies MetricSeriesTarget
  })

/**
 * Firing orchestrator for unified (target-on-monitor) monitors, run per (org, project)
 * by the same trigger as saved-search monitors. Resolves each active `event.*`/`metric.*`
 * alert's target and dispatches to the metric state machine. Per-alert failures (typed
 * errors AND defects, e.g. an unsupported filter operator) are isolated, logged and
 * tallied so one bad alert can't kill the sweep. Sequential: each alert opens its own tx.
 */
export const checkMetricMonitorsUseCase = (
  input: CheckMetricMonitorsInput,
): Effect.Effect<
  CheckMetricMonitorsResult,
  RepositoryError,
  SqlClient | ChSqlClient | MetricSeriesReader | AlertIncidentRepository | MonitorRepository | SavedSearchRepository
> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    const organizationId = OrganizationId(input.organizationId)
    const projectId = ProjectId(input.projectId)
    const now = new Date()

    const monitorRepository = yield* MonitorRepository
    const alerts = yield* monitorRepository.listActiveMetricMonitorAlerts(projectId)

    let failed = 0
    yield* Effect.forEach(
      alerts,
      (entry: MetricMonitorAlert) =>
        Effect.gen(function* () {
          const target = yield* resolveTarget(entry.target)
          // Skip a since-deleted saved-search reference (a check can race the delete).
          if (target === null) return
          yield* runMetricMonitorAlertUseCase({ organizationId, projectId, alert: entry.alert, target, now })
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.gen(function* () {
              failed += 1
              yield* Effect.logError("monitors.checkMetricMonitors alert evaluation failed", {
                monitorId: entry.alert.monitorId,
                alertId: entry.alert.id,
                kind: entry.alert.kind,
                error: Cause.squash(cause),
              })
            }),
          ),
        ),
      { concurrency: 1, discard: true },
    )

    yield* Effect.annotateCurrentSpan("evaluated", alerts.length)
    yield* Effect.annotateCurrentSpan("failed", failed)
    return { evaluated: alerts.length, failed }
  }).pipe(Effect.withSpan("monitors.checkMetricMonitors"))
