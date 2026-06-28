import { OutboxEventWriter } from "@domain/events"
import {
  IncidentRepository,
  isSignalEscalationEntrySignals,
  MIN_SEASONAL_SAMPLES,
  makeEscalationEngine,
  SeriesReader,
  seasonalAnomalyThreshold,
} from "@domain/incidents"
import { SavedSearchRepository } from "@domain/saved-searches"
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
  SavedSearchId,
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
  readonly failed: number
  readonly evaluatable: number
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

const inlineMonitorTarget = (monitor: Monitor, metric: MonitorMetric = monitor.target.metric): MetricSeriesTarget => ({
  stream: monitor.target.stream,
  filterSet: monitor.target.filterSet ?? {},
  query: monitor.target.query,
  metric,
})

interface ResolvedMonitorTarget {
  readonly monitor: Monitor
  readonly target: MetricSeriesTarget
}

const monitorCanEvaluate = (monitor: Monitor): boolean =>
  monitor.rule.trigger === "match" || monitor.rule.trigger === "threshold" || monitorCanUseSeasonalEngine(monitor)

const resolveMonitorTargets = (monitors: readonly Monitor[]) =>
  Effect.gen(function* () {
    const savedSearchRepository = yield* SavedSearchRepository
    const savedSearchTargetCache = new Map<string, Pick<MetricSeriesTarget, "filterSet" | "query"> | null>()

    const resolveSavedSearchTarget = (monitor: Monitor, metric: MonitorMetric) =>
      Effect.gen(function* () {
        const savedSearchId = monitor.target.id
        if (savedSearchId === null) return null
        let predicate: Pick<MetricSeriesTarget, "filterSet" | "query"> | null
        if (savedSearchTargetCache.has(savedSearchId)) {
          predicate = savedSearchTargetCache.get(savedSearchId) ?? null
        } else {
          predicate = yield* savedSearchRepository.findById(SavedSearchId(savedSearchId)).pipe(
            Effect.map((search) => ({ filterSet: search.filterSet, query: search.query })),
            Effect.catchTag("SavedSearchNotFoundError", () => Effect.succeed(null)),
            Effect.tap((target) => Effect.sync(() => savedSearchTargetCache.set(savedSearchId, target))),
          )
        }
        if (predicate === null) return null

        return {
          stream: monitor.target.stream,
          filterSet: predicate.filterSet,
          query: predicate.query,
          metric,
        } satisfies MetricSeriesTarget
      })

    const resolved = yield* Effect.forEach(
      monitors,
      (monitor) => {
        const target =
          monitor.target.type === "savedSearch"
            ? resolveSavedSearchTarget(monitor, monitor.target.metric)
            : Effect.succeed<MetricSeriesTarget | null>(inlineMonitorTarget(monitor))
        return target.pipe(Effect.map((target): ResolvedMonitorTarget | null => (target ? { monitor, target } : null)))
      },
      { concurrency: 1 },
    )

    return resolved.filter((entry): entry is ResolvedMonitorTarget => entry !== null)
  })

const evaluatePointMonitor = (
  monitor: Monitor,
  target: MetricSeriesTarget,
  condition: AlertIncidentCondition | null,
  metricReader: MetricSeriesReaderShape,
  now: Date,
) =>
  Effect.gen(function* () {
    const from = new Date(now.getTime() - SAVED_SEARCH_CURRENT_WINDOW_MS)
    if (monitor.rule.trigger === "match") {
      const matchTarget = { ...target, metric: { kind: "count" as const } }
      const value = yield* metricReader.valueInWindow({
        organizationId: monitor.organizationId,
        projectId: monitor.projectId,
        target: matchTarget,
        from,
        to: now,
      })
      if (value <= 0) return null
      const firstEventAt = yield* metricReader.firstEventAt({
        organizationId: monitor.organizationId,
        projectId: monitor.projectId,
        target: matchTarget,
        from,
        to: now,
      })
      return {
        startedAt: firstEventAt ?? now,
        condition,
      }
    }

    if (condition?.trigger !== "threshold") return null

    const metricTarget = { ...target, metric: condition.metric }
    const valueIn = (windowFrom: Date, windowTo: Date) =>
      metricReader.valueInWindow({
        organizationId: monitor.organizationId,
        projectId: monitor.projectId,
        target: metricTarget,
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
      const scale = metricIsAccumulating(metricTarget.metric) ? SAVED_SEARCH_CURRENT_WINDOW_MS / baseline.lengthMs : 1
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
          target: metricTarget,
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
    let evaluated = 0
    let failed = 0
    const evaluatable = active.filter(monitorCanEvaluate)

    const checkPointMonitor = (monitor: Monitor, target: MetricSeriesTarget) =>
      Effect.gen(function* () {
        const condition = monitorConfigCondition(monitor.rule.config)
        const point = yield* evaluatePointMonitor(monitor, target, condition, metricReader, now)
        if (point === null) return
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
      })

    const checkEscalatingMonitor = (monitor: Monitor, target: MetricSeriesTarget) =>
      Effect.gen(function* () {
        const seriesReader = makeMetricSeriesReaderSeriesReader(metricReader, {
          resolveTarget: (sourceId) => {
            if (sourceId !== monitor.id) {
              throw new Error(`Monitor ${sourceId} is not eligible for metric series evaluation`)
            }
            return target
          },
        })
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
          yield* sqlClient.transaction(
            Effect.gen(function* () {
              const closedId = yield* incidentRepository.closeOpen({
                sourceType: "monitor",
                sourceId: monitor.id,
                endedAt,
              })
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
            }),
          )
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
      })

    for (const monitor of evaluatable) {
      const checked = yield* Effect.gen(function* () {
        const resolved = yield* resolveMonitorTargets([monitor])
        const entry = resolved[0]
        if (entry === undefined) return false
        if (monitor.rule.trigger === "match" || monitor.rule.trigger === "threshold") {
          yield* checkPointMonitor(entry.monitor, entry.target)
          return true
        }
        if (monitorCanUseSeasonalEngine(monitor)) {
          yield* checkEscalatingMonitor(entry.monitor, entry.target)
          return true
        }
        return false
      }).pipe(
        Effect.catchCause(() =>
          Effect.sync(() => {
            failed += 1
            return false
          }),
        ),
      )
      if (checked) evaluated += 1
    }

    return { checked: monitors.length, evaluatable: evaluatable.length, evaluated, failed }
  }) as Effect.Effect<
    CheckMonitorsResult,
    RepositoryError,
    | SqlClient
    | ChSqlClient
    | MonitorRepository
    | IncidentRepository
    | MetricSeriesReader
    | OutboxEventWriter
    | SavedSearchRepository
  >
