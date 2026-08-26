import { OutboxEventWriter } from "@domain/events"
import {
  IncidentRepository,
  isSavedSearchEntrySignals,
  isSignalEscalationEntrySignals,
  MIN_SEASONAL_SAMPLES,
  makeEscalationEngine,
  type SavedSearchEntrySignals,
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
import { MATCH_MAX_CATCHUP_MS, SAVED_SEARCH_CURRENT_WINDOW_MS, THRESHOLD_EXIT_DWELL_MS } from "../constants.ts"
import type { Monitor } from "../entities/monitor.ts"
import { evaluationTimeAxis, monitorConfigCondition } from "../entities/monitor.ts"
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
  timeAxis: evaluationTimeAxis(monitor.rule.trigger, metric),
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

        const resolved: MetricSeriesTarget = {
          stream: monitor.target.stream,
          filterSet: predicate.filterSet,
          query: predicate.query,
          metric,
          timeAxis: evaluationTimeAxis(monitor.rule.trigger, metric),
        }
        return resolved
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

type ThresholdCondition = Extract<AlertIncidentCondition, { trigger: "threshold" }>

const thresholdMetricTarget = (target: MetricSeriesTarget, condition: ThresholdCondition): MetricSeriesTarget => ({
  ...target,
  metric: condition.metric,
  timeAxis: evaluationTimeAxis("threshold", condition.metric),
})

/** Where a `match` evaluation resumes from: its watermark, floored at {@link MATCH_MAX_CATCHUP_MS}, so consecutive windows abut whatever the check cadence. */
const matchWindowFrom = (monitor: Monitor, now: Date): Date => {
  const watermark = monitor.lastEvaluatedAt ?? new Date(now.getTime() - SAVED_SEARCH_CURRENT_WINDOW_MS)
  const earliest = new Date(now.getTime() - MATCH_MAX_CATCHUP_MS)
  return watermark.getTime() < earliest.getTime() ? earliest : watermark
}

const evaluateMatchPoint = (
  monitor: Monitor,
  target: MetricSeriesTarget,
  metricReader: MetricSeriesReaderShape,
  from: Date,
  now: Date,
) =>
  Effect.gen(function* () {
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
    return { startedAt: firstEventAt ?? now }
  })

const computeThresholdValue = (
  monitor: Monitor,
  target: MetricSeriesTarget,
  condition: ThresholdCondition,
  metricReader: MetricSeriesReaderShape,
  now: Date,
) =>
  Effect.gen(function* () {
    const metricTarget = thresholdMetricTarget(target, condition)
    const valueIn = (windowFrom: Date, windowTo: Date) =>
      metricReader.valueInWindow({
        organizationId: monitor.organizationId,
        projectId: monitor.projectId,
        target: metricTarget,
        from: windowFrom,
        to: windowTo,
      })
    const threshold = condition.threshold
    const direction = condition.direction ?? "above"
    if (threshold.mode === "absolute") return threshold.value
    if (threshold.mode === "multiplier") {
      const baseline = baselineWindow(threshold.baseline, now)
      const baselineValue = yield* valueIn(baseline.from, baseline.to)
      const scale = metricIsAccumulating(metricTarget.metric) ? SAVED_SEARCH_CURRENT_WINDOW_MS / baseline.lengthMs : 1
      return threshold.factor * baselineValue * scale
    }
    const historical = yield* Effect.all(
      Array.from({ length: SEASONAL_HISTORY_WEEKS }, (_unused, index) => {
        const historyTo = new Date(now.getTime() - (index + 1) * WEEK_MS)
        return valueIn(new Date(historyTo.getTime() - SAVED_SEARCH_CURRENT_WINDOW_MS), historyTo)
      }),
      { concurrency: "unbounded" },
    )
    return seasonalThreshold(historical, threshold, direction)
  })

/**
 * Evaluate a threshold condition over the current window. Without `frozenThreshold` the
 * live threshold is computed (the open decision); passing an open incident's frozen entry
 * threshold re-checks it against what tripped it, so a drifting multiplier/seasonal baseline
 * can't silently close a real breach.
 */
const evaluateThreshold = (
  monitor: Monitor,
  target: MetricSeriesTarget,
  condition: ThresholdCondition,
  metricReader: MetricSeriesReaderShape,
  now: Date,
  frozenThreshold?: number,
) =>
  Effect.gen(function* () {
    const metricTarget = thresholdMetricTarget(target, condition)
    const from = new Date(now.getTime() - SAVED_SEARCH_CURRENT_WINDOW_MS)
    const value = yield* metricReader.valueInWindow({
      organizationId: monitor.organizationId,
      projectId: monitor.projectId,
      target: metricTarget,
      from,
      to: now,
    })
    const thresholdValue =
      frozenThreshold !== undefined
        ? frozenThreshold
        : yield* computeThresholdValue(monitor, target, condition, metricReader, now)
    const direction = condition.direction ?? "above"
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
    if (isMet && direction === "below" && condition.threshold.mode === "absolute" && firstEventAt === null)
      isMet = false
    return { met: isMet, startedAt: firstEventAt ?? now, thresholdValue }
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

    const checkMatchMonitor = (monitor: Monitor, target: MetricSeriesTarget) =>
      Effect.gen(function* () {
        const point = yield* evaluateMatchPoint(monitor, target, metricReader, matchWindowFrom(monitor, now), now)
        if (point === null) {
          yield* monitorRepository.setLastEvaluatedAt({ id: monitor.id, lastEvaluatedAt: now })
          return
        }
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
              condition: null,
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
            // Same transaction as the incident: a crash between the two would advance the watermark past a match never recorded.
            yield* monitorRepository.setLastEvaluatedAt({ id: monitor.id, lastEvaluatedAt: now })
          }),
        )
      })

    const checkThresholdMonitor = (monitor: Monitor, target: MetricSeriesTarget) =>
      Effect.gen(function* () {
        const condition = monitorConfigCondition(monitor.rule.config)
        if (condition?.trigger !== "threshold") return
        const openIncident = yield* incidentRepository.findOpen({ sourceType: "monitor", sourceId: monitor.id })

        if (openIncident === null) {
          const breach = yield* evaluateThreshold(monitor, target, condition, metricReader, now)
          if (!breach.met) return
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
                startedAt: breach.startedAt,
                endedAt: null,
                createdAt,
                entrySignals: { evaluatedThreshold: breach.thresholdValue } satisfies SavedSearchEntrySignals,
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
          return
        }

        // An open incident exists: re-check against the FROZEN entry threshold so a
        // drifting baseline can't auto-close a live breach. A single open incident per
        // episode (the partial unique index) means one alert, not one per sweep.
        const frozenThreshold = isSavedSearchEntrySignals(openIncident.entrySignals)
          ? openIncident.entrySignals.evaluatedThreshold
          : undefined
        const breach = yield* evaluateThreshold(monitor, target, condition, metricReader, now, frozenThreshold)

        if (breach.met) {
          if (openIncident.exitEligibleSince !== null) {
            yield* incidentRepository.updateExitDwell({ id: openIncident.id, exitEligibleSince: null })
          }
          return
        }
        if (openIncident.exitEligibleSince === null) {
          yield* incidentRepository.updateExitDwell({ id: openIncident.id, exitEligibleSince: now })
          return
        }
        if (now.getTime() - openIncident.exitEligibleSince.getTime() >= THRESHOLD_EXIT_DWELL_MS) {
          // Silent close: no IncidentClosed event, so no recovery notification. `ended_at`
          // is the moment it cleared, and closing re-arms a fresh alert on recurrence.
          yield* incidentRepository.closeOpen({
            sourceType: "monitor",
            sourceId: monitor.id,
            endedAt: openIncident.exitEligibleSince,
          })
        }
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
        if (monitor.rule.trigger === "match") {
          yield* checkMatchMonitor(entry.monitor, entry.target)
          return true
        }
        if (monitor.rule.trigger === "threshold") {
          yield* checkThresholdMonitor(entry.monitor, entry.target)
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
