import {
  DEFAULT_ESCALATION_SENSITIVITY_K,
  MIN_SEASONAL_SAMPLES,
  SEASONAL_HISTORY_WEEKS,
  seasonalAnomalyThreshold,
} from "@domain/issues"
import type {
  AlertIncidentMetricEscalatingCondition,
  AlertIncidentMetricThresholdCondition,
  AlertMetricThreshold,
  AlertMetricThresholdDirection,
  ChSqlClient,
  MonitorMetric,
  OrganizationId,
  ProjectId,
  RepositoryError,
} from "@domain/shared"
import { Effect } from "effect"
import { pickEscalatingBucketMs, SAVED_SEARCH_CURRENT_WINDOW_MS } from "../constants.ts"
import { MetricSeriesReader, type MetricSeriesTarget } from "../ports/metric-series-reader.ts"
import { baselineWindow, mean, sampleStddev, WEEK_MS } from "./evaluate-saved-search-alert.ts"

/**
 * `count`/`sum` accumulate over a window, so a `multiplier` baseline (and a
 * windowed absolute) must be normalised to the measurement window; `avg`/`p95`/
 * `errorRate` are already intensive (a rate/level), so they compare directly.
 */
const isAccumulating = (metric: MonitorMetric): boolean => metric.kind === "count" || metric.kind === "sum"

export interface EvaluateMetricAlertInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** The monitor's resolved target — its `metric` is what gets measured. */
  readonly target: MetricSeriesTarget
  readonly condition: AlertIncidentMetricThresholdCondition
  readonly now: Date
}

export type EvaluateMetricAlertError = RepositoryError

/** Verdict + the numbers the state machine snapshots onto the incident. */
export interface MetricAlertEvaluation {
  readonly isMet: boolean
  readonly value: number
  readonly threshold: number
  /** Earliest matching-event time in the window; backs `startedAt` backtracking. `null` when empty. */
  readonly firstEventInWindow: Date | null
  /** Present only for multiplier mode. */
  readonly baselineValue?: number
}

const sigmaEffective = (observed: number, expected: number): number =>
  Math.max(observed, Math.sqrt(Math.max(0, expected)), 1.0)

const seasonalThreshold = (
  historical: readonly number[],
  threshold: Extract<AlertMetricThreshold, { mode: "expected" }>,
  direction: AlertMetricThresholdDirection,
): number => {
  const sensitivity = threshold.sensitivity ?? DEFAULT_ESCALATION_SENSITIVITY_K
  const expected = mean(historical)
  const kAdj = historical.length < MIN_SEASONAL_SAMPLES ? sensitivity + 1 : sensitivity
  const stddev = sampleStddev(historical, expected)
  if (direction === "below") return Math.max(0, expected - kAdj * sigmaEffective(stddev, expected))
  return seasonalAnomalyThreshold(expected, stddev, kAdj)
}

export const isMetricThresholdMet = (value: number, threshold: number, direction: AlertMetricThresholdDirection) =>
  direction === "below" ? threshold > 0 && value <= threshold : value >= threshold

/**
 * Evaluate one `metric.threshold` alert at `now` over the monitor's target
 * metric. Pure modulo the `MetricSeriesReader` IO. Mirrors the saved-search
 * threshold evaluator, but the metric is the target's (not a hardcoded count)
 * and the absolute threshold is a float `value` (not an int `count`).
 */
export const evaluateMetricAlert = (
  input: EvaluateMetricAlertInput,
): Effect.Effect<MetricAlertEvaluation, EvaluateMetricAlertError, MetricSeriesReader | ChSqlClient> =>
  Effect.gen(function* () {
    const reader = yield* MetricSeriesReader
    const { organizationId, projectId, target, condition, now } = input
    const valueIn = (from: Date, to: Date) => reader.valueInWindow({ organizationId, projectId, target, from, to })

    const accumulating = isAccumulating(target.metric)
    const windowMs = SAVED_SEARCH_CURRENT_WINDOW_MS
    const from = new Date(now.getTime() - windowMs)
    const value = yield* valueIn(from, now)

    const threshold = condition.threshold
    const direction = condition.direction ?? "above"
    let thresholdValue: number
    let baselineValue: number | undefined
    if (threshold.mode === "absolute") {
      thresholdValue = threshold.value
    } else if (threshold.mode === "multiplier") {
      const window = baselineWindow(threshold.baseline, now)
      baselineValue = yield* valueIn(window.from, window.to)
      // Accumulating metrics need the baseline rescaled to the current window; intensive metrics don't.
      const scale = accumulating ? windowMs / window.lengthMs : 1
      thresholdValue = threshold.factor * baselineValue * scale
    } else {
      const historical = yield* Effect.all(
        Array.from({ length: SEASONAL_HISTORY_WEEKS }, (_unused, index) => {
          const historyTo = new Date(now.getTime() - (index + 1) * WEEK_MS)
          return valueIn(new Date(historyTo.getTime() - windowMs), historyTo)
        }),
        { concurrency: "unbounded" },
      )
      thresholdValue = seasonalThreshold(historical, threshold, direction)
    }
    const isMet = isMetricThresholdMet(value, thresholdValue, direction)

    // Only the firing branch backtracks `startedAt`; gate on `isMet`, not the metric
    // value (an intensive metric like avg/errorRate can be 0 with real activity).
    const firstEventInWindow = isMet
      ? yield* reader.firstEventAt({ organizationId, projectId, target, from, to: now })
      : null

    return {
      isMet,
      value,
      threshold: thresholdValue,
      firstEventInWindow,
      ...(baselineValue !== undefined ? { baselineValue } : {}),
    } satisfies MetricAlertEvaluation
  }).pipe(Effect.withSpan("monitors.evaluateMetricAlert"))

/** The numbers the `metric.escalating` sustained-gate state machine reads. */
export interface MetricEscalatingEvaluation {
  /** Per-bucket metric values over `[now - window, now]`, newest-first, zero-filled. */
  readonly bucketValues: readonly number[]
  readonly bucketMs: number
  /** Threshold a single bucket must clear to "pass" (frozen onto `entrySignals` at open). */
  readonly perBucketThreshold: number
  readonly firstEventInWindow: Date | null
  readonly baselineValue?: number
}

export interface EvaluateMetricEscalatingAlertInput extends Omit<EvaluateMetricAlertInput, "condition"> {
  readonly condition: AlertIncidentMetricEscalatingCondition
}

/**
 * Evaluate one `metric.escalating` alert at `now` over fixed-size buckets tiling
 * `[now - window, now]`. The threshold is computed for a single bucket, so
 * "sustained for the whole window" reduces to "(almost) every bucket clears the
 * per-bucket threshold" (same state machine as saved-search escalating).
 */
export const evaluateMetricEscalatingAlert = (
  input: EvaluateMetricEscalatingAlertInput,
): Effect.Effect<MetricEscalatingEvaluation, EvaluateMetricAlertError, MetricSeriesReader | ChSqlClient> =>
  Effect.gen(function* () {
    const reader = yield* MetricSeriesReader
    const { organizationId, projectId, target, condition, now } = input
    const valueIn = (from: Date, to: Date) => reader.valueInWindow({ organizationId, projectId, target, from, to })

    const accumulating = isAccumulating(target.metric)
    const windowMs = condition.window.minutes * 60 * 1000
    const bucketMs = pickEscalatingBucketMs(windowMs)
    const from = new Date(now.getTime() - windowMs)
    const bucketValues = yield* reader.seriesPerBucket({ organizationId, projectId, target, from, to: now, bucketMs })

    const threshold = condition.threshold
    const direction = condition.direction ?? "above"
    let perBucketThreshold: number
    let baselineValue: number | undefined
    if (threshold.mode === "absolute") {
      // Accumulating absolute thresholds are per-window totals → scale down to one bucket; intensive ones are per-bucket as-is.
      perBucketThreshold = accumulating ? threshold.value * (bucketMs / windowMs) : threshold.value
    } else if (threshold.mode === "multiplier") {
      const baseline = baselineWindow(threshold.baseline, now)
      baselineValue = yield* valueIn(baseline.from, baseline.to)
      const scale = accumulating ? bucketMs / baseline.lengthMs : 1
      perBucketThreshold = threshold.factor * baselineValue * scale
    } else {
      const historical = yield* Effect.all(
        Array.from({ length: SEASONAL_HISTORY_WEEKS }, (_unused, index) => {
          const historyTo = new Date(now.getTime() - (index + 1) * WEEK_MS)
          return valueIn(new Date(historyTo.getTime() - bucketMs), historyTo)
        }),
        { concurrency: "unbounded" },
      )
      perBucketThreshold = seasonalThreshold(historical, threshold, direction)
    }

    // The open decision is downstream (state machine); always resolve the backtrace
    // anchor. `firstEventAt` self-guards (returns null on no rows), so this is safe for
    // intensive metrics where a zero bucket value doesn't imply zero activity.
    const firstEventInWindow = yield* reader.firstEventAt({ organizationId, projectId, target, from, to: now })

    return {
      bucketValues,
      bucketMs,
      perBucketThreshold,
      firstEventInWindow,
      ...(baselineValue !== undefined ? { baselineValue } : {}),
    } satisfies MetricEscalatingEvaluation
  }).pipe(Effect.withSpan("monitors.evaluateMetricEscalatingAlert"))
