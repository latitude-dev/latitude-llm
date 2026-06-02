/**
 * Project-wide cohort percentile baselines, shared by traces and sessions.
 *
 * A "cohort" is every trace (or session) in the project. For each numeric
 * metric we compute p50/p90/p95/p99 across the cohort and expose them as a
 * baseline that the UI compares a single item's value against (the
 * trace/session outlier badge).
 *
 * Percentiles are gated by sample count: a p99 derived from 20 samples is
 * noise, so we null it out below the gate. The badge UI treats `null` as
 * "level not available" and falls back to the next-lower percentile.
 */

/** Min samples in a cohort before its p90 is shown as a badge. */
export const COHORT_P90_MIN_SAMPLES = 30
/** Min samples in a cohort before its p95 is shown as a badge. */
export const COHORT_P95_MIN_SAMPLES = 100
/** Min samples in a cohort before its p99 is shown as a badge. */
export const COHORT_P99_MIN_SAMPLES = 1000

export const cohortMetrics = ["durationNs", "costTotalMicrocents", "tokensTotal", "timeToFirstTokenNs"] as const
export type CohortMetric = (typeof cohortMetrics)[number]

export type MetricPercentileLevel = "p90" | "p95" | "p99"

/**
 * Raw percentile readings as returned by the repository (pre-gating). `p95`
 * and `p99` arrive as `number | null` because the repo applies its own
 * sample-count thresholds in the SQL (`sampleCount >= 100 / >= 1000`).
 */
export interface MetricPercentiles {
  readonly sampleCount: number
  readonly p50: number
  readonly p90: number
  readonly p95: number | null
  readonly p99: number | null
}

/**
 * Gated baseline consumed by the UI. The build step re-applies the p95/p99
 * sample-count gates defensively so consumers don't have to know about them.
 */
export interface MetricBaseline {
  readonly metric: CohortMetric
  readonly sampleCount: number
  readonly p50: number
  readonly p90: number
  readonly p95: number | null
  readonly p99: number | null
}

/** Raw cohort baseline payload returned by the repository. */
export interface CohortBaselineData {
  /** Number of items (traces or sessions) in the cohort. */
  readonly count: number
  readonly metrics: Readonly<Record<CohortMetric, MetricPercentiles>>
}

/** Cached/serialized summary returned from the use-case to the UI. */
export interface CohortSummary {
  readonly count: number
  readonly baselines: Readonly<Record<CohortMetric, MetricBaseline>>
}

export function buildMetricBaseline(metric: CohortMetric, input: MetricPercentiles): MetricBaseline {
  return {
    metric,
    sampleCount: input.sampleCount,
    p50: input.p50,
    p90: input.p90,
    p95: input.sampleCount >= COHORT_P95_MIN_SAMPLES ? input.p95 : null,
    p99: input.sampleCount >= COHORT_P99_MIN_SAMPLES ? input.p99 : null,
  }
}

export function buildMetricBaselines(data: CohortBaselineData): Readonly<Record<CohortMetric, MetricBaseline>> {
  return {
    durationNs: buildMetricBaseline("durationNs", data.metrics.durationNs),
    costTotalMicrocents: buildMetricBaseline("costTotalMicrocents", data.metrics.costTotalMicrocents),
    tokensTotal: buildMetricBaseline("tokensTotal", data.metrics.tokensTotal),
    timeToFirstTokenNs: buildMetricBaseline("timeToFirstTokenNs", data.metrics.timeToFirstTokenNs),
  }
}

export function isMetricPercentileAvailable(
  baseline: Pick<MetricBaseline, "sampleCount" | "p90" | "p95" | "p99">,
  level: MetricPercentileLevel,
): boolean {
  switch (level) {
    case "p90":
      return baseline.sampleCount >= COHORT_P90_MIN_SAMPLES
    case "p95":
      return baseline.p95 !== null
    case "p99":
      return baseline.p99 !== null
  }
}

export function getMetricPercentileThreshold(
  baseline: Pick<MetricBaseline, "sampleCount" | "p90" | "p95" | "p99">,
  level: MetricPercentileLevel,
): number | null {
  switch (level) {
    case "p90":
      return isMetricPercentileAvailable(baseline, "p90") ? baseline.p90 : null
    case "p95":
      return baseline.p95
    case "p99":
      return baseline.p99
  }
}
