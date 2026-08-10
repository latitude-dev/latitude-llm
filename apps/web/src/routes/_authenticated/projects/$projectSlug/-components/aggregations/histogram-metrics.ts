import type { SessionMetrics, TraceHistogramMetric, TraceMetrics, TraceTimeHistogramBucket } from "@domain/spans"
import { cacheHitRate, formatCount, formatDuration, formatPercentage, formatPrice } from "@repo/utils"

/**
 * Single source of truth shared by the metric cards and the histogram chart. Each entry says how to
 * label the metric, where to read its scalar value (for the cards) and its per-bucket value (for
 * the chart), how to format both, and the noun used in tooltips ("traces", "tokens", …).
 *
 * Adding a new metric here is enough to expose it as both a card and a histogram series — keep this
 * map in sync with `TRACE_HISTOGRAM_METRICS` in `@domain/spans`.
 */
export interface HistogramMetricDefinition {
  readonly id: TraceHistogramMetric
  readonly label: string
  readonly cardSkeletonWidthClassName: string
  readonly tooltipNoun: string
  readonly formatBucket: (value: number) => string
  readonly selectBucket: (bucket: TraceTimeHistogramBucket) => number
  /**
   * Returns the scalar value shown on the card. Accepts either rollup so the panel can switch
   * sources without casting; TS catches divergence if a future field exists on one but not the
   * other.
   */
  readonly selectMetricsValue: (metrics: TraceMetrics | SessionMetrics, totalCount: number) => number
  /**
   * Per-row average shown under the card value. The rollup is computed over session rows in sessions
   * mode and trace rows in traces mode, so `avg` is already per-unit — and it is the only thing that
   * moves between modes on a card whose headline is a sum, since a sum over sessions equals the same
   * sum over their traces.
   */
  readonly selectUnitAverage?: (metrics: TraceMetrics | SessionMetrics) => number
  /**
   * Whether to show this metric's card/series for the current aggregate. Omit
   * for always-visible metrics; a ratio metric hides itself when its
   * denominator is empty so it doesn't render a meaningless permanent 0.
   */
  readonly isAvailable?: (metrics: TraceMetrics | SessionMetrics | undefined) => boolean
}

export type AggregationsMode = "traces" | "sessions"

/**
 * Card + histogram metric order per mode, leading with the mode's own unit. `sessions` is absent in
 * traces mode: the session count is a project-wide count of sessions matching the filters read as
 * *session* filters, so it cannot answer "how many sessions do these traces belong to" — showing it
 * beside a filtered trace list reads as a broken number rather than a different question.
 */
const METRIC_ORDER_BY_MODE: Readonly<
  Record<AggregationsMode, readonly [TraceHistogramMetric, ...TraceHistogramMetric[]]>
> = {
  sessions: ["sessions", "cost", "duration", "tokens", "cacheHitRate", "traces", "spans"],
  traces: ["traces", "cost", "duration", "tokens", "cacheHitRate", "spans"],
}

export const metricOrderForMode = (mode: AggregationsMode): readonly TraceHistogramMetric[] =>
  METRIC_ORDER_BY_MODE[mode]

/** Row noun of the aggregate backing each mode — the denominator of every `selectUnitAverage`. */
export const unitNounForMode = (mode: AggregationsMode): string => (mode === "sessions" ? "session" : "trace")

/**
 * Resolves the selected metric against the active mode: an explicit pick wins as long as the mode
 * offers that metric, otherwise the mode's leading metric does — so the chart plots the unit the
 * table below it is listing.
 */
export const resolveMetricForMode = (
  metric: TraceHistogramMetric | undefined,
  mode: AggregationsMode,
): TraceHistogramMetric => {
  const [leading, ...rest] = METRIC_ORDER_BY_MODE[mode]
  if (metric && (metric === leading || rest.includes(metric))) return metric
  return leading
}

const microcentsToUSD = (microcents: number): string => formatPrice(microcents / 100_000_000)

export const HISTOGRAM_METRIC_DEFINITIONS: Readonly<Record<TraceHistogramMetric, HistogramMetricDefinition>> = {
  sessions: {
    id: "sessions",
    label: "Sessions",
    cardSkeletonWidthClassName: "w-16",
    tooltipNoun: "sessions",
    formatBucket: formatCount,
    selectBucket: (b) => b.sessionCount,
    // Card value is rendered out-of-band from a session-count query — see
    // `general-aggregations.tsx`. This stub is unused for `sessions`.
    selectMetricsValue: () => 0,
  },
  traces: {
    id: "traces",
    label: "Traces",
    cardSkeletonWidthClassName: "w-16",
    tooltipNoun: "traces",
    formatBucket: formatCount,
    selectBucket: (b) => b.traceCount,
    selectMetricsValue: (_metrics, totalCount) => totalCount,
  },
  cost: {
    id: "cost",
    label: "Cost",
    cardSkeletonWidthClassName: "w-20",
    tooltipNoun: "", // Already formats value
    formatBucket: microcentsToUSD,
    selectBucket: (b) => b.costTotalMicrocentsSum,
    selectMetricsValue: (m) => m.costTotalMicrocents.sum,
    selectUnitAverage: (m) => m.costTotalMicrocents.avg,
  },
  duration: {
    id: "duration",
    label: "Median duration",
    cardSkeletonWidthClassName: "w-20",
    tooltipNoun: "", // Already formats value
    formatBucket: formatDuration,
    selectBucket: (b) => b.durationNsMedian,
    selectMetricsValue: (m) => m.durationNs.median,
    selectUnitAverage: (m) => m.durationNs.avg,
  },
  tokens: {
    id: "tokens",
    label: "Tokens",
    cardSkeletonWidthClassName: "w-20",
    tooltipNoun: "tokens",
    formatBucket: formatCount,
    selectBucket: (b) => b.tokensTotalSum,
    selectMetricsValue: (m) => m.tokensTotal.sum,
    selectUnitAverage: (m) => m.tokensTotal.avg,
  },
  cacheHitRate: {
    id: "cacheHitRate",
    label: "Cache hit rate",
    cardSkeletonWidthClassName: "w-16",
    tooltipNoun: "", // Already formats value
    formatBucket: formatPercentage,
    // Per-bucket token-weighted ratio; 0 for buckets with no input-side tokens.
    selectBucket: (b) =>
      cacheHitRate({
        input: b.tokensInputSum,
        cacheRead: b.tokensCacheReadSum,
        cacheCreate: b.tokensCacheCreateSum,
      }) ?? 0,
    selectMetricsValue: (m) => m.tokenAnalytics.cacheHitRate ?? 0,
    // Undefined (null) rate ⇒ no input-side tokens in view; hide rather than show 0%.
    isAvailable: (m) => !!m && m.tokenAnalytics.cacheHitRate !== null,
  },
  spans: {
    id: "spans",
    label: "Spans",
    cardSkeletonWidthClassName: "w-16",
    tooltipNoun: "spans",
    formatBucket: formatCount,
    selectBucket: (b) => b.spanCountSum,
    selectMetricsValue: (m) => m.spanCount.sum,
    selectUnitAverage: (m) => m.spanCount.avg,
  },
}
