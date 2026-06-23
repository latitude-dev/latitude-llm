import { OutboxEventWriter } from "@domain/events"
import {
  IncidentRepository,
  isSignalEscalationEntrySignals,
  MIN_SEASONAL_SAMPLES,
  makeEscalationEngine,
  SeriesReader,
  seasonalAnomalyThreshold,
} from "@domain/incidents"
import {
  type AlertBaseline,
  type AlertIncidentCondition,
  AlertIncidentId,
  type AlertMetricThreshold,
  type AlertMetricThresholdDirection,
  type ChSqlClient,
  DEFAULT_ESCALATION_SENSITIVITY,
  generateId,
  type MonitorMetric,
  type ProjectId,
  type RepositoryError,
  SqlClient,
} from "@domain/shared"
import { SEASONAL_HISTORY_WEEKS } from "@domain/signals"
import { Effect } from "effect"
import { SAVED_SEARCH_CURRENT_WINDOW_MS } from "../constants.ts"
import type { Monitor } from "../entities/monitor.ts"
import { monitorConfigCondition } from "../entities/monitor.ts"
import type { MetricSeriesReaderShape, MetricSeriesTarget } from "../ports/metric-series-reader.ts"
import { MetricSeriesReader, makeMetricSeriesReaderSeriesReader } from "../ports/metric-series-reader.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"

export interface CheckMonitorsInput {
  readonly projectId: ProjectId
}

export interface CheckMonitorsResult {
  readonly checked: number
  readonly evaluated: number
}

const monitorCanUseSeasonalEngine = (monitor: Monitor): boolean => {
  const condition = monitorConfigCondition(monitor.rule.config)
  const threshold = condition?.trigger === "escalating" ? condition.threshold : undefined
  return (
    monitor.rule.trigger === "escalating" &&
    monitor.target.metric.kind === "count" &&
    (threshold === undefined || threshold.mode === "expected")
  )
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const durationToMs = (duration: AlertBaseline["lookback"]): number => {
  if (duration.unit === "minutes") return duration.minutes * 60 * 1000
  if (duration.unit === "hours") return duration.hours * 60 * 60 * 1000
  return duration.days * 24 * 60 * 60 * 1000
}

const baselineWindow = (baseline: AlertBaseline, now: Date): { from: Date; to: Date; lengthMs: number } => {
  const lengthMs = durationToMs(baseline.lookback)
  if (baseline.kind === "average") return { from: new Date(now.getTime() - lengthMs), to: now, lengthMs }
  return { from: new Date(now.getTime() - 2 * lengthMs), to: new Date(now.getTime() - lengthMs), lengthMs }
}

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length

const sampleStddev = (values: readonly number[], avg: number): number => {
  if (values.length < 2) return 0
  return Math.sqrt(values.reduce((total, value) => total + (value - avg) ** 2, 0) / (values.length - 1))
}

const sigmaEffective = (stddev: number, avg: number): number => Math.max(stddev, Math.sqrt(Math.max(0, avg)), 1)

const metricIsAccumulating = (metric: MonitorMetric): boolean => metric.kind === "count" || metric.kind === "sum"

const isThresholdMet = (value: number, threshold: number, direction: AlertMetricThresholdDirection) =>
  direction === "below" ? threshold > 0 && value <= threshold : threshold > 0 ? value >= threshold : value > 0

const seasonalThreshold = (
  historical: readonly number[],
  threshold: Extract<AlertMetricThreshold, { mode: "expected" }>,
  direction: AlertMetricThresholdDirection,
): number => {
  const sensitivity = threshold.sensitivity ?? DEFAULT_ESCALATION_SENSITIVITY
  const expected = mean(historical)
  const adjustedSensitivity = historical.length < MIN_SEASONAL_SAMPLES ? sensitivity + 1 : sensitivity
  const deviation = sampleStddev(historical, expected)
  if (direction === "below") return Math.max(0, expected - adjustedSensitivity * sigmaEffective(deviation, expected))
  return seasonalAnomalyThreshold(expected, deviation, adjustedSensitivity)
}

const monitorTarget = (monitor: Monitor, metric: MonitorMetric = monitor.target.metric): MetricSeriesTarget => ({
  stream: monitor.target.stream,
  filterSet: monitor.target.filterSet ?? {},
  query: monitor.target.query,
  metric,
})

const evaluatePointMonitor = (
  monitor: Monitor,
  condition: AlertIncidentCondition | null,
  metricReader: MetricSeriesReaderShape,
  now: Date,
) =>
  Effect.gen(function* () {
    const from = new Date(now.getTime() - SAVED_SEARCH_CURRENT_WINDOW_MS)
    if (monitor.rule.trigger === "match") {
      const target = monitorTarget(monitor)
      const value = yield* metricReader.valueInWindow({
        organizationId: monitor.organizationId,
        projectId: monitor.projectId,
        target,
        from,
        to: now,
      })
      if (value <= 0) return null
      const firstEventAt = yield* metricReader.firstEventAt({
        organizationId: monitor.organizationId,
        projectId: monitor.projectId,
        target,
        from,
        to: now,
      })
      return {
        startedAt: firstEventAt ?? now,
        condition,
      }
    }

    if (condition?.trigger !== "threshold") return null

    const target = monitorTarget(monitor, condition.metric)
    const valueIn = (windowFrom: Date, windowTo: Date) =>
      metricReader.valueInWindow({
        organizationId: monitor.organizationId,
        projectId: monitor.projectId,
        target,
        from: windowFrom,
        to: windowTo,
      })
    const value = yield* valueIn(from, now)
    const threshold = condition.threshold
    const direction = condition.direction ?? "above"
    let thresholdValue: number
    if (threshold.mode === "absolute") {
      thresholdValue = threshold.value
    } else if (threshold.mode === "multiplier") {
      const baseline = baselineWindow(threshold.baseline, now)
      const baselineValue = yield* valueIn(baseline.from, baseline.to)
      const scale = metricIsAccumulating(target.metric) ? SAVED_SEARCH_CURRENT_WINDOW_MS / baseline.lengthMs : 1
      thresholdValue = threshold.factor * baselineValue * scale
    } else {
      const historical = yield* Effect.all(
        Array.from({ length: SEASONAL_HISTORY_WEEKS }, (_unused, index) => {
          const historyTo = new Date(now.getTime() - (index + 1) * WEEK_MS)
          return valueIn(new Date(historyTo.getTime() - SAVED_SEARCH_CURRENT_WINDOW_MS), historyTo)
        }),
        { concurrency: "unbounded" },
      )
      thresholdValue = seasonalThreshold(historical, threshold, direction)
    }

    let isMet = isThresholdMet(value, thresholdValue, direction)
    const firstEventAt = isMet
      ? yield* metricReader.firstEventAt({
          organizationId: monitor.organizationId,
          projectId: monitor.projectId,
          target,
          from,
          to: now,
        })
      : null
    if (isMet && direction === "below" && threshold.mode === "absolute" && firstEventAt === null) isMet = false
    if (!isMet) return null
    return {
      startedAt: firstEventAt ?? now,
      condition,
    }
  })

export const checkMonitorsUseCase = (input: CheckMonitorsInput) =>
  Effect.gen(function* () {
    const monitorRepository = yield* MonitorRepository
    const incidentRepository = yield* IncidentRepository
    const metricReader = yield* MetricSeriesReader
    const sqlClient = yield* SqlClient
    const outboxEventWriter = yield* OutboxEventWriter
    const monitors = yield* monitorRepository.listActiveMonitors({ projectId: input.projectId })
    const now = new Date()
    const active = monitors.filter((monitor) => monitor.mutedAt === null)
    const pointMonitors = active.filter(
      (monitor) => monitor.rule.trigger === "match" || monitor.rule.trigger === "threshold",
    )
    const eligible = active.filter(monitorCanUseSeasonalEngine)
    const monitorById = new Map(eligible.map((monitor) => [monitor.id as string, monitor]))
    const seriesReader = makeMetricSeriesReaderSeriesReader(metricReader, {
      resolveTarget: (sourceId) => {
        const monitor = monitorById.get(sourceId)
        if (!monitor) throw new Error(`Monitor ${sourceId} is not eligible for metric series evaluation`)
        return {
          stream: monitor.target.stream,
          filterSet: monitor.target.filterSet ?? {},
          query: monitor.target.query,
          metric: monitor.target.metric,
        }
      },
    })

    for (const monitor of pointMonitors) {
      const condition = monitorConfigCondition(monitor.rule.config)
      const point = yield* evaluatePointMonitor(monitor, condition, metricReader, now)
      if (point === null) continue
      yield* sqlClient.transaction(
        Effect.gen(function* () {
          const createdAt = new Date()
          const incident = {
            id: AlertIncidentId(generateId()),
            organizationId: monitor.organizationId,
            projectId: monitor.projectId,
            sourceType: "monitor" as const,
            sourceId: monitor.id,
            severity: monitor.rule.severity,
            startedAt: point.startedAt,
            endedAt: point.startedAt,
            createdAt,
            entrySignals: null,
            exitEligibleSince: null,
            condition: point.condition,
          }
          yield* incidentRepository.insert(incident)
          yield* outboxEventWriter.write({
            eventName: "IncidentCreated",
            aggregateType: "alert_incident",
            aggregateId: incident.id,
            organizationId: incident.organizationId,
            payload: {
              organizationId: incident.organizationId,
              projectId: incident.projectId,
              alertIncidentId: incident.id,
              sourceType: "monitor",
              sourceId: monitor.id,
            },
          })
        }),
      )
    }

    for (const monitor of eligible) {
      const openIncident = yield* incidentRepository.findOpen({ sourceType: "monitor", sourceId: monitor.id })
      const condition = monitorConfigCondition(monitor.rule.config)
      const thresholdSensitivity =
        condition?.trigger === "escalating" && condition.threshold?.mode === "expected"
          ? condition.threshold.sensitivity
          : undefined
      const sensitivity =
        condition?.trigger === "escalating"
          ? (condition.sensitivity ?? thresholdSensitivity ?? DEFAULT_ESCALATION_SENSITIVITY)
          : DEFAULT_ESCALATION_SENSITIVITY
      const decision = yield* makeEscalationEngine()
        .evaluate({
          organizationId: monitor.organizationId,
          projectId: monitor.projectId,
          sourceId: monitor.id,
          kShort: sensitivity,
          isNew: false,
          wasEscalating: openIncident !== null,
          entrySignals:
            openIncident && isSignalEscalationEntrySignals(openIncident.entrySignals)
              ? openIncident.entrySignals
              : null,
          startedAt: openIncident?.startedAt ?? null,
          exitEligibleSince: openIncident?.exitEligibleSince ?? null,
          now,
        })
        .pipe(Effect.provideService(SeriesReader, seriesReader))

      if (decision.transition === "enter") {
        yield* sqlClient.transaction(
          Effect.gen(function* () {
            const now = new Date()
            const incident = {
              id: AlertIncidentId(generateId()),
              organizationId: monitor.organizationId,
              projectId: monitor.projectId,
              sourceType: "monitor" as const,
              sourceId: monitor.id,
              severity: monitor.rule.severity,
              startedAt: decision.transitionAt ?? now,
              endedAt: null,
              createdAt: now,
              entrySignals: decision.entrySignalsSnapshot ?? null,
              exitEligibleSince: null,
              condition,
            }
            yield* incidentRepository.insert(incident)
            yield* outboxEventWriter.write({
              eventName: "IncidentCreated",
              aggregateType: "alert_incident",
              aggregateId: incident.id,
              organizationId: incident.organizationId,
              payload: {
                organizationId: incident.organizationId,
                projectId: incident.projectId,
                alertIncidentId: incident.id,
                sourceType: "monitor",
                sourceId: monitor.id,
              },
            })
          }),
        )
      } else if (decision.transition === "exit") {
        const endedAt = decision.transitionAt ?? new Date()
        const closedId = yield* incidentRepository.closeOpen({ sourceType: "monitor", sourceId: monitor.id, endedAt })
        if (closedId !== null) {
          yield* outboxEventWriter.write({
            eventName: "IncidentClosed",
            aggregateType: "alert_incident",
            aggregateId: closedId,
            organizationId: monitor.organizationId,
            payload: {
              organizationId: monitor.organizationId,
              projectId: monitor.projectId,
              alertIncidentId: closedId,
              sourceType: "monitor",
              sourceId: monitor.id,
              reason: decision.reason ?? "threshold",
            },
          })
        }
      } else if (openIncident !== null) {
        const previous = openIncident.exitEligibleSince?.getTime() ?? null
        const next = decision.nextExitEligibleSince?.getTime() ?? null
        if (previous !== next) {
          yield* incidentRepository.updateExitDwell({
            id: openIncident.id,
            exitEligibleSince: decision.nextExitEligibleSince,
          })
        }
      }
    }

    return { checked: monitors.length, evaluated: pointMonitors.length + eligible.length }
  }) as Effect.Effect<
    CheckMonitorsResult,
    RepositoryError,
    SqlClient | ChSqlClient | MonitorRepository | IncidentRepository | MetricSeriesReader | OutboxEventWriter
  >
