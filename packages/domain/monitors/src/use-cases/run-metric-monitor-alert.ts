import { AlertIncidentRepository, isSavedSearchEntrySignals, type SavedSearchEntrySignals } from "@domain/alerts"
import { type ChSqlClient, type OrganizationId, type ProjectId, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { countFailingBuckets, maxFailingBuckets, SAVED_SEARCH_CURRENT_WINDOW_MS } from "../constants.ts"
import type { MonitorAlert } from "../entities/monitor.ts"
import { MetricSeriesReader, type MetricSeriesTarget } from "../ports/metric-series-reader.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"
import {
  type EvaluateMetricAlertError,
  evaluateMetricAlert,
  evaluateMetricEscalatingAlert,
  isMetricThresholdMet,
} from "./evaluate-metric-alert.ts"
import { closeMetricIncident, openMetricIncident } from "./metric-incident-writer.ts"

export interface RunMetricMonitorAlertInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly alert: MonitorAlert
  /** The monitor's resolved target ({stream, filterSet, query, metric}). */
  readonly target: MetricSeriesTarget
  readonly now: Date
}

export interface RunMetricMonitorAlertResult {
  readonly transition: "fired" | "opened" | "closed" | "none"
}

export type RunMetricMonitorAlertError = EvaluateMetricAlertError | RepositoryError

const countNonPassingBuckets = (bucketValues: readonly number[], threshold: number, direction: "above" | "below") => {
  if (direction === "above") return countFailingBuckets(bucketValues, threshold)
  return bucketValues.filter((value) => !isMetricThresholdMet(value, threshold, direction)).length
}

/**
 * State machine for the unified `event.*`/`metric.*` alerts over a monitor's
 * target. Mirrors the saved-search machines but writes sourceless incidents:
 * - `event.matched`  — point incident when any row matches the current window.
 * - `metric.threshold` — rearm: open while the metric is over threshold, silent
 *   close when it drops (a current-window rate, so no one-time absolute branch).
 * - `metric.escalating` — sustained gate over per-bucket values; close once too
 *   many buckets fall below the threshold frozen at open.
 */
export const runMetricMonitorAlertUseCase = (input: RunMetricMonitorAlertInput) =>
  Effect.gen(function* () {
    const { organizationId, projectId, alert, target, now } = input
    const sqlClient = yield* SqlClient
    const alertIncidentRepository = yield* AlertIncidentRepository

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        if (alert.kind === "event.matched") {
          const reader = yield* MetricSeriesReader
          const from = new Date(now.getTime() - SAVED_SEARCH_CURRENT_WINDOW_MS)
          // "A new matching row" is a count question, independent of the monitor's metric.
          const countTarget: MetricSeriesTarget = { ...target, metric: { kind: "count" } }
          const value = yield* reader.valueInWindow({ organizationId, projectId, target: countTarget, from, to: now })
          if (value <= 0) return { transition: "none" } satisfies RunMetricMonitorAlertResult
          const first = yield* reader.firstEventAt({ organizationId, projectId, target: countTarget, from, to: now })
          const startedAt = first ?? now
          yield* openMetricIncident({
            organizationId,
            projectId,
            alert,
            startedAt,
            endedAt: startedAt,
            entrySignals: null,
            now,
          })
          return { transition: "fired" } satisfies RunMetricMonitorAlertResult
        }

        const condition = alert.condition
        if (alert.kind === "metric.threshold") {
          if (condition?.kind !== "metric.threshold") {
            return yield* Effect.die(`runMetricMonitorAlert: not a metric.threshold alert (${alert.id})`)
          }
          const monitorRepository = yield* MonitorRepository
          yield* monitorRepository.lockAlertForUpdate(alert.id)
          const evaluation = yield* evaluateMetricAlert({ organizationId, projectId, target, condition, now })
          const open = yield* alertIncidentRepository.findOpenByMonitorAlertId(alert.id)
          if (open === null && evaluation.isMet) {
            yield* openMetricIncident({
              organizationId,
              projectId,
              alert,
              startedAt: evaluation.firstEventInWindow ?? now,
              endedAt: null,
              entrySignals: null,
              now,
            })
            return { transition: "opened" } satisfies RunMetricMonitorAlertResult
          }
          if (open !== null && !evaluation.isMet) {
            yield* alertIncidentRepository.setEndedAt({ id: open.id, endedAt: now })
            return { transition: "closed" } satisfies RunMetricMonitorAlertResult
          }
          return { transition: "none" } satisfies RunMetricMonitorAlertResult
        }

        if (alert.kind === "metric.escalating") {
          if (condition?.kind !== "metric.escalating") {
            return yield* Effect.die(`runMetricMonitorAlert: not a metric.escalating alert (${alert.id})`)
          }
          const monitorRepository = yield* MonitorRepository
          // Serialise concurrent ticks for this alert before the read-then-insert
          // so two sweeps can't both see no open incident and double-open.
          yield* monitorRepository.lockAlertForUpdate(alert.id)
          const evaluation = yield* evaluateMetricEscalatingAlert({ organizationId, projectId, target, condition, now })
          const open = yield* alertIncidentRepository.findOpenByMonitorAlertId(alert.id)
          const maxFail = maxFailingBuckets(evaluation.bucketValues.length)
          const direction = condition.direction ?? "above"

          if (open === null) {
            const failing = countNonPassingBuckets(evaluation.bucketValues, evaluation.perBucketThreshold, direction)
            if (failing > maxFail) return { transition: "none" } satisfies RunMetricMonitorAlertResult
            const entrySignals: SavedSearchEntrySignals = {
              evaluatedThreshold: evaluation.perBucketThreshold,
              ...(evaluation.baselineValue !== undefined ? { baselineCount: evaluation.baselineValue } : {}),
              ...(condition.threshold.mode === "multiplier" ? { baseline: condition.threshold.baseline } : {}),
            }
            const startedAt =
              evaluation.firstEventInWindow ?? new Date(now.getTime() - condition.window.minutes * 60 * 1000)
            yield* openMetricIncident({ organizationId, projectId, alert, startedAt, endedAt: null, entrySignals, now })
            return { transition: "opened" } satisfies RunMetricMonitorAlertResult
          }

          const frozenThreshold = isSavedSearchEntrySignals(open.entrySignals)
            ? open.entrySignals.evaluatedThreshold
            : evaluation.perBucketThreshold
          if (countNonPassingBuckets(evaluation.bucketValues, frozenThreshold, direction) <= maxFail) {
            return { transition: "none" } satisfies RunMetricMonitorAlertResult
          }
          const reader = yield* MetricSeriesReader
          const lastEvent = yield* reader.lastEventAt({
            organizationId,
            projectId,
            target,
            from: open.startedAt,
            to: now,
          })
          yield* closeMetricIncident(open, lastEvent ?? now)
          return { transition: "closed" } satisfies RunMetricMonitorAlertResult
        }

        return yield* Effect.die(`runMetricMonitorAlert: unsupported kind ${alert.kind}`)
      }),
    )
  }).pipe(Effect.withSpan("monitors.runMetricMonitorAlert")) as Effect.Effect<
    RunMetricMonitorAlertResult,
    RunMetricMonitorAlertError,
    SqlClient | ChSqlClient | MetricSeriesReader | AlertIncidentRepository | MonitorRepository
  >
