import {
  DEFAULT_ESCALATION_SENSITIVITY_K,
  MIN_SEASONAL_SAMPLES,
  SEASONAL_HISTORY_WEEKS,
  seasonalAnomalyThreshold,
} from "@domain/issues"
import type {
  AlertBaseline,
  AlertDuration,
  ChSqlClient,
  OrganizationId,
  ProjectId,
  RepositoryError,
} from "@domain/shared"
import { Effect } from "effect"
import { pickEscalatingBucketMs, SAVED_SEARCH_CURRENT_WINDOW_MS } from "../constants.ts"
import type { MonitorAlert } from "../entities/monitor.ts"
import { SavedSearchMatchReader, type SavedSearchMatchTarget } from "../ports/saved-search-match-reader.ts"

/** Verdict + the numbers the state machines snapshot onto the incident. */
export interface SavedSearchEvaluation {
  readonly isMet: boolean
  /** Matches in the current window (cumulative since the alert for absolute mode). */
  readonly count: number
  readonly threshold: number
  /** Backs `startedAt` backtracking; `null` when the window was empty. */
  readonly firstMatchInWindow: Date | null
  /** Present only for multiplier mode. */
  readonly baselineCount?: number
}

export interface EvaluateSavedSearchAlertInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly alert: MonitorAlert
  readonly target: SavedSearchMatchTarget
  readonly now: Date
}

export type EvaluateSavedSearchAlertError = RepositoryError

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const durationToMs = (duration: AlertDuration): number =>
  duration.unit === "hours" ? duration.hours * 60 * 60 * 1000 : duration.days * 24 * 60 * 60 * 1000

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length

/** Sample (n−1) standard deviation; `0` for fewer than two points. */
const sampleStddev = (values: readonly number[], avg: number): number => {
  if (values.length < 2) return 0
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/** `average` = trailing window of length `L`; `period` = the equal-length window just before it (yesterday / last week). */
const baselineWindow = (baseline: AlertBaseline, now: Date): { from: Date; to: Date; lengthMs: number } => {
  const lengthMs = durationToMs(baseline.lookback)
  if (baseline.kind === "average") return { from: new Date(now.getTime() - lengthMs), to: now, lengthMs }
  return { from: new Date(now.getTime() - 2 * lengthMs), to: new Date(now.getTime() - lengthMs), lengthMs }
}

/** Evaluate one saved-search alert at `now`. Pure modulo the `SavedSearchMatchReader` IO; window + threshold vary by kind/mode (see branches). */
export const evaluateSavedSearchAlert = (
  input: EvaluateSavedSearchAlertInput,
): Effect.Effect<SavedSearchEvaluation, EvaluateSavedSearchAlertError, SavedSearchMatchReader | ChSqlClient> =>
  Effect.gen(function* () {
    const reader = yield* SavedSearchMatchReader
    const { organizationId, projectId, alert, target, now } = input
    const countIn = (from: Date, to: Date) => reader.countMatches({ organizationId, projectId, target, from, to })

    // Any match in the trailing window fires; the queue throttle is the rate limiter.
    if (alert.kind === "savedSearch.match") {
      const from = new Date(now.getTime() - SAVED_SEARCH_CURRENT_WINDOW_MS)
      const count = yield* countIn(from, now)
      const firstMatchInWindow =
        count > 0 ? yield* reader.firstMatchAt({ organizationId, projectId, target, from, to: now }) : null
      return { isMet: count > 0, count, threshold: 1, firstMatchInWindow } satisfies SavedSearchEvaluation
    }

    const condition = alert.condition
    if (condition === null || condition.kind !== "savedSearch.threshold") {
      // The orchestrator routes only `savedSearch.threshold` here; `savedSearch.match` is
      // handled above and `savedSearch.escalating` goes through `evaluateSavedSearchEscalatingAlert`.
      return yield* Effect.die(`evaluateSavedSearchAlert: unexpected condition for alert ${alert.id} (${alert.kind})`)
    }

    const threshold = condition.threshold
    const currentWindowMs =
      threshold.mode === "absolute"
        ? Math.max(0, now.getTime() - alert.createdAt.getTime())
        : SAVED_SEARCH_CURRENT_WINDOW_MS
    const from = new Date(now.getTime() - currentWindowMs)
    const count = yield* countIn(from, now)

    let thresholdValue: number
    let baselineCount: number | undefined
    let isMet: boolean
    if (threshold.mode === "absolute") {
      // Positive-integer threshold, so `count === 0` never fires.
      thresholdValue = threshold.count
      isMet = count >= thresholdValue
    } else if (threshold.mode === "multiplier") {
      const window = baselineWindow(threshold.baseline, now)
      baselineCount = yield* countIn(window.from, window.to)
      // Normalise the baseline to a current-window slice so the two counts are comparable rates.
      thresholdValue = threshold.factor * baselineCount * (currentWindowMs / window.lengthMs)
      // Zero baseline → zero threshold; require real activity.
      isMet = count > 0 && count >= thresholdValue
    } else {
      // `expected`: σ-band over the same-time-of-week window across the last N weeks
      // (detector math shared from `@domain/issues`).
      const sensitivity = threshold.sensitivity ?? DEFAULT_ESCALATION_SENSITIVITY_K
      const historical = yield* Effect.all(
        Array.from({ length: SEASONAL_HISTORY_WEEKS }, (_unused, index) => {
          const historyTo = new Date(now.getTime() - (index + 1) * WEEK_MS)
          return countIn(new Date(historyTo.getTime() - currentWindowMs), historyTo)
        }),
        { concurrency: "unbounded" },
      )
      const expected = mean(historical)
      // Widen the band when the sample is thin (mirrors the detector).
      const kAdj = historical.length < MIN_SEASONAL_SAMPLES ? sensitivity + 1 : sensitivity
      thresholdValue = seasonalAnomalyThreshold(expected, sampleStddev(historical, expected), kAdj)
      isMet = count > 0 && count > thresholdValue
    }

    const firstMatchInWindow =
      count > 0 ? yield* reader.firstMatchAt({ organizationId, projectId, target, from, to: now }) : null

    return {
      isMet,
      count,
      threshold: thresholdValue,
      firstMatchInWindow,
      ...(baselineCount !== undefined ? { baselineCount } : {}),
    } satisfies SavedSearchEvaluation
  }).pipe(Effect.withSpan("monitors.evaluateSavedSearchAlert"))

/** The numbers the `savedSearch.escalating` sustained-gate / prompt-close state machine reads. */
export interface SavedSearchEscalatingEvaluation {
  /**
   * Per-bucket match counts over `[now - window, now]`, newest-first, zero-filled.
   * Length is the bucket count `N`; a gap shows up as a `0` bucket.
   */
  readonly bucketCounts: readonly number[]
  /** Bucket width used to tile the window, in ms (1 min for `window <= 15 min`, else 5 min). */
  readonly bucketMs: number
  /** Threshold a single bucket must meet to "pass" — per-mode (see branches); the value frozen onto `entrySignals` at open. */
  readonly perBucketThreshold: number
  /** Earliest match in the window; backs `startedAt` backtracking. `null` when the window was empty. */
  readonly firstMatchInWindow: Date | null
  /** Present only for multiplier mode (frozen onto entry signals). */
  readonly baselineCount?: number
}

/**
 * Evaluate one `savedSearch.escalating` alert at `now` over fixed-size buckets
 * tiling `[now - window, now]`. The threshold is computed for a single bucket
 * (measurement window = `bucketMs`), so "sustained for the whole window" reduces
 * to "(almost) every bucket clears the per-bucket threshold" — see the state
 * machine in `run-saved-search-escalating-alert.ts`. Pure modulo the reader IO.
 */
export const evaluateSavedSearchEscalatingAlert = (
  input: EvaluateSavedSearchAlertInput,
): Effect.Effect<
  SavedSearchEscalatingEvaluation,
  EvaluateSavedSearchAlertError,
  SavedSearchMatchReader | ChSqlClient
> =>
  Effect.gen(function* () {
    const reader = yield* SavedSearchMatchReader
    const { organizationId, projectId, alert, target, now } = input
    const condition = alert.condition
    if (alert.kind !== "savedSearch.escalating" || condition?.kind !== "savedSearch.escalating") {
      // The orchestrator only routes escalating alerts here — a wiring bug, not runtime state.
      return yield* Effect.die(`evaluateSavedSearchEscalatingAlert: not a savedSearch.escalating alert (${alert.id})`)
    }
    const countIn = (from: Date, to: Date) => reader.countMatches({ organizationId, projectId, target, from, to })

    const windowMs = condition.window.minutes * 60 * 1000
    const bucketMs = pickEscalatingBucketMs(windowMs)
    const from = new Date(now.getTime() - windowMs)
    const bucketCounts = yield* reader.countMatchesPerBucket({
      organizationId,
      projectId,
      target,
      from,
      to: now,
      bucketMs,
    })

    const threshold = condition.threshold
    let perBucketThreshold: number
    let baselineCount: number | undefined
    if (threshold.mode === "absolute") {
      // The configured count is a per-bucket requirement (every bucket needs `>= count` matches).
      perBucketThreshold = threshold.count
    } else if (threshold.mode === "multiplier") {
      const baseline = baselineWindow(threshold.baseline, now)
      baselineCount = yield* countIn(baseline.from, baseline.to)
      // Normalise the baseline rate down to a single bucket so the per-bucket counts are comparable.
      perBucketThreshold = threshold.factor * baselineCount * (bucketMs / baseline.lengthMs)
    } else {
      // `expected`: seasonal σ-band sized to a single bucket (same detector math as issues / threshold mode).
      const sensitivity = threshold.sensitivity ?? DEFAULT_ESCALATION_SENSITIVITY_K
      const historical = yield* Effect.all(
        Array.from({ length: SEASONAL_HISTORY_WEEKS }, (_unused, index) => {
          const historyTo = new Date(now.getTime() - (index + 1) * WEEK_MS)
          return countIn(new Date(historyTo.getTime() - bucketMs), historyTo)
        }),
        { concurrency: "unbounded" },
      )
      const expected = mean(historical)
      const kAdj = historical.length < MIN_SEASONAL_SAMPLES ? sensitivity + 1 : sensitivity
      perBucketThreshold = seasonalAnomalyThreshold(expected, sampleStddev(historical, expected), kAdj)
    }

    // One first-match query for the `startedAt` backtrace, only when the window has activity.
    const total = bucketCounts.reduce((sum, count) => sum + count, 0)
    const firstMatchInWindow =
      total > 0 ? yield* reader.firstMatchAt({ organizationId, projectId, target, from, to: now }) : null

    return {
      bucketCounts,
      bucketMs,
      perBucketThreshold,
      firstMatchInWindow,
      ...(baselineCount !== undefined ? { baselineCount } : {}),
    } satisfies SavedSearchEscalatingEvaluation
  }).pipe(Effect.withSpan("monitors.evaluateSavedSearchEscalatingAlert"))
