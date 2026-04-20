import type { Trace } from "./entities/trace.ts"

export const TRACE_RESOURCE_OUTLIER_MULTIPLIER = 3

export const TRACE_COHORT_P90_MIN_SAMPLES = 30
export const TRACE_COHORT_P95_MIN_SAMPLES = 100
export const TRACE_COHORT_P99_MIN_SAMPLES = 1000
export const TRACE_COHORT_MEDIAN_X3_MIN_SAMPLES = 30

export const traceCohortMetrics = ["durationNs", "costTotalMicrocents", "tokensTotal", "timeToFirstTokenNs"] as const

export type TraceCohortMetric = (typeof traceCohortMetrics)[number]

export const traceCohortKeys = [
  "latency-p95-plus",
  "latency-p99-plus",
  "cost-p95-plus",
  "cost-p99-plus",
  "tokens-p95-plus",
  "tokens-p99-plus",
  "ttft-p95-plus",
  "ttft-p99-plus",
  "latency-and-cost-p95-plus",
  "latency-and-cost-p99-plus",
  "latency-median-x3",
  "cost-median-x3",
  "tokens-median-x3",
  "ttft-median-x3",
] as const

export type TraceCohortKey = (typeof traceCohortKeys)[number]

export type TraceCohortUnavailableReason = "insufficient-baseline" | "mixed-mode-suppressed"
export type TraceCohortThresholdMode = "p99" | "p95" | "median-x3" | "insufficient-baseline"
export type TraceMetricPercentileLevel = "p90" | "p95" | "p99"

export interface TraceMetricPercentiles {
  readonly sampleCount: number
  readonly p50: number
  readonly p90: number
  readonly p95: number | null
  readonly p99: number | null
}

export interface TraceCohortBaselineData {
  readonly traceCount: number
  readonly metrics: Readonly<Record<TraceCohortMetric, TraceMetricPercentiles>>
}

export interface TraceMetricBaseline {
  readonly metric: TraceCohortMetric
  readonly sampleCount: number
  readonly p50: number
  readonly p90: number
  readonly p95: number | null
  readonly p99: number | null
  readonly medianX3: number | null
  readonly primaryThresholdMode: TraceCohortThresholdMode
}

export interface TraceCohortSummaryEntry {
  readonly key: TraceCohortKey
  readonly available: boolean
  readonly count: number | null
  readonly unavailableReason?: TraceCohortUnavailableReason
}

export interface TraceCohortSummary {
  readonly effectiveRangeStartIso: string
  readonly effectiveRangeEndIso: string
  readonly traceCount: number
  readonly baselines: Readonly<Record<TraceCohortMetric, TraceMetricBaseline>>
}

export interface TraceResourceOutlierReason {
  readonly key: TraceCohortKey
  readonly thresholdMode: Exclude<TraceCohortThresholdMode, "insufficient-baseline">
  readonly metric: TraceCohortMetric | "latencyAndCost"
  readonly values: Partial<Record<TraceCohortMetric, number>>
  readonly thresholds: Partial<Record<TraceCohortMetric, number>>
  readonly medians: Partial<Record<TraceCohortMetric, number>>
}

export interface TraceCohortListingSpec {
  readonly cohort: TraceCohortKey
  readonly baselines: Readonly<Record<TraceCohortMetric, TraceMetricBaseline>>
  readonly unavailableReason?: TraceCohortUnavailableReason
}

/**
 * Single-trace resource outlier evaluation.
 *
 * `reasons` includes every cohort rule that fires for this trace (including standalone single-metric p95 when baselines allow).
 * `matched` is the **system-queue** signal: true only for combined latency+cost at p95/p99, any single-metric p99, or median×3.
 * Standalone single-metric p95 hits appear in `reasons` but do not set `matched`.
 */
export interface TraceResourceOutlierEvaluation {
  readonly matched: boolean
  readonly reasons: readonly TraceResourceOutlierReason[]
}

export const traceResourceOutlierSeverityRank: Readonly<Record<TraceCohortKey, number>> = {
  "latency-and-cost-p99-plus": 5,
  "latency-p99-plus": 4,
  "cost-p99-plus": 4,
  "tokens-p99-plus": 4,
  "ttft-p99-plus": 4,
  "latency-and-cost-p95-plus": 3,
  "latency-p95-plus": 2,
  "cost-p95-plus": 2,
  "tokens-p95-plus": 2,
  "ttft-p95-plus": 2,
  "latency-median-x3": 1,
  "cost-median-x3": 1,
  "tokens-median-x3": 1,
  "ttft-median-x3": 1,
}

export const emptyTraceCohortSummaryEntry = (key: TraceCohortKey): TraceCohortSummaryEntry => ({
  key,
  available: false,
  count: null,
  unavailableReason: "insufficient-baseline",
})

export function getTraceCohortMetricValue(trace: Trace, metric: TraceCohortMetric): number {
  switch (metric) {
    case "durationNs":
      return trace.durationNs
    case "costTotalMicrocents":
      return trace.costTotalMicrocents
    case "tokensTotal":
      return trace.tokensTotal
    case "timeToFirstTokenNs":
      return trace.timeToFirstTokenNs
  }
}

export function isTraceCohortMetricEligible(metric: TraceCohortMetric, value: number): boolean {
  return metric === "timeToFirstTokenNs" ? value > 0 : true
}

export function buildTraceMetricBaseline(
  metric: TraceCohortMetric,
  input: TraceMetricPercentiles,
): TraceMetricBaseline {
  const p50 = input.p50
  const p95 = input.sampleCount >= TRACE_COHORT_P95_MIN_SAMPLES ? input.p95 : null
  const p99 = input.sampleCount >= TRACE_COHORT_P99_MIN_SAMPLES ? input.p99 : null
  const medianX3 =
    input.sampleCount >= TRACE_COHORT_MEDIAN_X3_MIN_SAMPLES && p50 > 0 && p95 === null
      ? p50 * TRACE_RESOURCE_OUTLIER_MULTIPLIER
      : null

  return {
    metric,
    sampleCount: input.sampleCount,
    p50,
    p90: input.p90,
    p95,
    p99,
    medianX3,
    primaryThresholdMode:
      p99 !== null ? "p99" : p95 !== null ? "p95" : medianX3 !== null ? "median-x3" : "insufficient-baseline",
  }
}

export function buildTraceMetricBaselines(
  data: TraceCohortBaselineData,
): Readonly<Record<TraceCohortMetric, TraceMetricBaseline>> {
  return {
    durationNs: buildTraceMetricBaseline("durationNs", data.metrics.durationNs),
    costTotalMicrocents: buildTraceMetricBaseline("costTotalMicrocents", data.metrics.costTotalMicrocents),
    tokensTotal: buildTraceMetricBaseline("tokensTotal", data.metrics.tokensTotal),
    timeToFirstTokenNs: buildTraceMetricBaseline("timeToFirstTokenNs", data.metrics.timeToFirstTokenNs),
  }
}

export function isTraceMetricPercentileAvailable(
  baseline: Pick<TraceMetricBaseline, "sampleCount" | "p90" | "p95" | "p99">,
  level: TraceMetricPercentileLevel,
): boolean {
  switch (level) {
    case "p90":
      return baseline.sampleCount >= TRACE_COHORT_P90_MIN_SAMPLES
    case "p95":
      return baseline.p95 !== null
    case "p99":
      return baseline.p99 !== null
  }
}

export function getTraceMetricPercentileThreshold(
  baseline: Pick<TraceMetricBaseline, "sampleCount" | "p90" | "p95" | "p99">,
  level: TraceMetricPercentileLevel,
): number | null {
  switch (level) {
    case "p90":
      return isTraceMetricPercentileAvailable(baseline, "p90") ? baseline.p90 : null
    case "p95":
      return baseline.p95
    case "p99":
      return baseline.p99
  }
}

function isMetricCohortAvailable(baseline: TraceMetricBaseline, mode: "p95" | "p99" | "median-x3"): boolean {
  switch (mode) {
    case "p95":
      return isTraceMetricPercentileAvailable(baseline, "p95")
    case "p99":
      return isTraceMetricPercentileAvailable(baseline, "p99")
    case "median-x3":
      return baseline.medianX3 !== null
  }
}

export function isTraceCohortKeyAvailable(
  key: TraceCohortKey,
  baselines: Readonly<Record<TraceCohortMetric, TraceMetricBaseline>>,
): { readonly available: boolean; readonly unavailableReason?: TraceCohortUnavailableReason } {
  switch (key) {
    case "latency-p95-plus":
      return isMetricCohortAvailable(baselines.durationNs, "p95") ? { available: true } : unavailable()
    case "latency-p99-plus":
      return isMetricCohortAvailable(baselines.durationNs, "p99") ? { available: true } : unavailable()
    case "cost-p95-plus":
      return isMetricCohortAvailable(baselines.costTotalMicrocents, "p95") ? { available: true } : unavailable()
    case "cost-p99-plus":
      return isMetricCohortAvailable(baselines.costTotalMicrocents, "p99") ? { available: true } : unavailable()
    case "tokens-p95-plus":
      return isMetricCohortAvailable(baselines.tokensTotal, "p95") ? { available: true } : unavailable()
    case "tokens-p99-plus":
      return isMetricCohortAvailable(baselines.tokensTotal, "p99") ? { available: true } : unavailable()
    case "ttft-p95-plus":
      return isMetricCohortAvailable(baselines.timeToFirstTokenNs, "p95") ? { available: true } : unavailable()
    case "ttft-p99-plus":
      return isMetricCohortAvailable(baselines.timeToFirstTokenNs, "p99") ? { available: true } : unavailable()
    case "latency-median-x3":
      return isMetricCohortAvailable(baselines.durationNs, "median-x3") ? { available: true } : unavailable()
    case "cost-median-x3":
      return isMetricCohortAvailable(baselines.costTotalMicrocents, "median-x3") ? { available: true } : unavailable()
    case "tokens-median-x3":
      return isMetricCohortAvailable(baselines.tokensTotal, "median-x3") ? { available: true } : unavailable()
    case "ttft-median-x3":
      return isMetricCohortAvailable(baselines.timeToFirstTokenNs, "median-x3") ? { available: true } : unavailable()
    case "latency-and-cost-p95-plus":
      return isMetricCohortAvailable(baselines.durationNs, "p95") &&
        isMetricCohortAvailable(baselines.costTotalMicrocents, "p95")
        ? { available: true }
        : unavailable("mixed-mode-suppressed")
    case "latency-and-cost-p99-plus":
      return isMetricCohortAvailable(baselines.durationNs, "p99") &&
        isMetricCohortAvailable(baselines.costTotalMicrocents, "p99")
        ? { available: true }
        : unavailable("mixed-mode-suppressed")
  }
}

function unavailable(reason: TraceCohortUnavailableReason = "insufficient-baseline") {
  return { available: false as const, unavailableReason: reason }
}

export function buildTraceCohortSummaryEntries(
  baselines: Readonly<Record<TraceCohortMetric, TraceMetricBaseline>>,
  counts: Partial<Record<TraceCohortKey, number>>,
): readonly TraceCohortSummaryEntry[] {
  return traceCohortKeys.map((key) => {
    const availability = isTraceCohortKeyAvailable(key, baselines)
    if (availability.available) {
      return { key, available: true, count: counts[key] ?? 0 }
    }

    return {
      key,
      available: false,
      count: null,
      unavailableReason: availability.unavailableReason ?? "insufficient-baseline",
    }
  })
}

export function buildTraceCohortListingSpec(
  cohort: TraceCohortKey,
  baselines: Readonly<Record<TraceCohortMetric, TraceMetricBaseline>>,
): TraceCohortListingSpec {
  const availability = isTraceCohortKeyAvailable(cohort, baselines)
  return {
    cohort,
    baselines,
    ...(availability.available ? {} : { unavailableReason: availability.unavailableReason }),
  }
}

function buildMetricReason(
  key: TraceCohortKey,
  metric: TraceCohortMetric,
  mode: Exclude<TraceCohortThresholdMode, "insufficient-baseline">,
  value: number,
  threshold: number,
  baseline: TraceMetricBaseline,
): TraceResourceOutlierReason {
  return {
    key,
    metric,
    thresholdMode: mode,
    values: { [metric]: value },
    thresholds: { [metric]: threshold },
    medians: { [metric]: baseline.p50 },
  }
}

function maybeMetricReason(
  trace: Trace,
  metric: TraceCohortMetric,
  baseline: TraceMetricBaseline,
  key: TraceCohortKey,
  mode: Exclude<TraceCohortThresholdMode, "insufficient-baseline">,
  threshold: number | null,
): TraceResourceOutlierReason | null {
  const value = getTraceCohortMetricValue(trace, metric)
  if (!isTraceCohortMetricEligible(metric, value) || threshold === null || value < threshold) {
    return null
  }

  return buildMetricReason(key, metric, mode, value, threshold, baseline)
}

function maybeCombinedLatencyCostReason(
  trace: Trace,
  baselines: Readonly<Record<TraceCohortMetric, TraceMetricBaseline>>,
  key: "latency-and-cost-p95-plus" | "latency-and-cost-p99-plus",
  mode: "p95" | "p99",
): TraceResourceOutlierReason | null {
  const latencyThreshold = mode === "p99" ? baselines.durationNs.p99 : baselines.durationNs.p95
  const costThreshold = mode === "p99" ? baselines.costTotalMicrocents.p99 : baselines.costTotalMicrocents.p95
  if (latencyThreshold === null || costThreshold === null) return null
  if (trace.durationNs < latencyThreshold || trace.costTotalMicrocents < costThreshold) return null

  return {
    key,
    metric: "latencyAndCost",
    thresholdMode: mode,
    values: { durationNs: trace.durationNs, costTotalMicrocents: trace.costTotalMicrocents },
    thresholds: { durationNs: latencyThreshold, costTotalMicrocents: costThreshold },
    medians: { durationNs: baselines.durationNs.p50, costTotalMicrocents: baselines.costTotalMicrocents.p50 },
  }
}

export function evaluateTraceResourceOutliers(
  trace: Trace,
  baselines: Readonly<Record<TraceCohortMetric, TraceMetricBaseline>>,
): TraceResourceOutlierEvaluation {
  const reasons = [
    maybeCombinedLatencyCostReason(trace, baselines, "latency-and-cost-p99-plus", "p99"),
    maybeMetricReason(trace, "durationNs", baselines.durationNs, "latency-p99-plus", "p99", baselines.durationNs.p99),
    maybeMetricReason(
      trace,
      "costTotalMicrocents",
      baselines.costTotalMicrocents,
      "cost-p99-plus",
      "p99",
      baselines.costTotalMicrocents.p99,
    ),
    maybeMetricReason(trace, "tokensTotal", baselines.tokensTotal, "tokens-p99-plus", "p99", baselines.tokensTotal.p99),
    maybeMetricReason(
      trace,
      "timeToFirstTokenNs",
      baselines.timeToFirstTokenNs,
      "ttft-p99-plus",
      "p99",
      baselines.timeToFirstTokenNs.p99,
    ),
    maybeCombinedLatencyCostReason(trace, baselines, "latency-and-cost-p95-plus", "p95"),
    maybeMetricReason(trace, "durationNs", baselines.durationNs, "latency-p95-plus", "p95", baselines.durationNs.p95),
    maybeMetricReason(
      trace,
      "costTotalMicrocents",
      baselines.costTotalMicrocents,
      "cost-p95-plus",
      "p95",
      baselines.costTotalMicrocents.p95,
    ),
    maybeMetricReason(trace, "tokensTotal", baselines.tokensTotal, "tokens-p95-plus", "p95", baselines.tokensTotal.p95),
    maybeMetricReason(
      trace,
      "timeToFirstTokenNs",
      baselines.timeToFirstTokenNs,
      "ttft-p95-plus",
      "p95",
      baselines.timeToFirstTokenNs.p95,
    ),
    maybeMetricReason(
      trace,
      "durationNs",
      baselines.durationNs,
      "latency-median-x3",
      "median-x3",
      baselines.durationNs.medianX3,
    ),
    maybeMetricReason(
      trace,
      "costTotalMicrocents",
      baselines.costTotalMicrocents,
      "cost-median-x3",
      "median-x3",
      baselines.costTotalMicrocents.medianX3,
    ),
    maybeMetricReason(
      trace,
      "tokensTotal",
      baselines.tokensTotal,
      "tokens-median-x3",
      "median-x3",
      baselines.tokensTotal.medianX3,
    ),
    maybeMetricReason(
      trace,
      "timeToFirstTokenNs",
      baselines.timeToFirstTokenNs,
      "ttft-median-x3",
      "median-x3",
      baselines.timeToFirstTokenNs.medianX3,
    ),
  ].filter((reason): reason is TraceResourceOutlierReason => reason !== null)

  const matched = reasons.some((reason) => {
    if (reason.key === "latency-and-cost-p95-plus" || reason.key === "latency-and-cost-p99-plus") return true
    if (reason.thresholdMode === "p99") return true
    return reason.thresholdMode === "median-x3"
  })

  return {
    matched,
    reasons,
  }
}
