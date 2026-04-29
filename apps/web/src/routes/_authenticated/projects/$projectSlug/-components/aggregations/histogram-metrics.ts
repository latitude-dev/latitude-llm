import type { TraceHistogramMetric, TraceMetrics, TraceTimeHistogramBucket } from "@domain/spans"
import { formatCount, formatDuration, formatPrice } from "@repo/utils"

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
  /** Returns the scalar value shown on the card; undefined when metrics haven't loaded yet. */
  readonly selectMetricsValue: (metrics: TraceMetrics, totalCount: number) => number
}

const microcentsToUSD = (microcents: number): string => formatPrice(microcents / 100_000_000)

export const HISTOGRAM_METRIC_DEFINITIONS: Readonly<Record<TraceHistogramMetric, HistogramMetricDefinition>> = {
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
    label: "Total cost",
    cardSkeletonWidthClassName: "w-20",
    tooltipNoun: "", // Already formats value
    formatBucket: microcentsToUSD,
    selectBucket: (b) => b.costTotalMicrocentsSum,
    selectMetricsValue: (m) => m.costTotalMicrocents.sum,
  },
  duration: {
    id: "duration",
    label: "Median duration",
    cardSkeletonWidthClassName: "w-20",
    tooltipNoun: "", // Already formats value
    formatBucket: formatDuration,
    selectBucket: (b) => b.durationNsMedian,
    selectMetricsValue: (m) => m.durationNs.median,
  },
  tokens: {
    id: "tokens",
    label: "Total tokens",
    cardSkeletonWidthClassName: "w-20",
    tooltipNoun: "tokens",
    formatBucket: formatCount,
    selectBucket: (b) => b.tokensTotalSum,
    selectMetricsValue: (m) => m.tokensTotal.sum,
  },
  ttft: {
    id: "ttft",
    label: "Median time to first token",
    cardSkeletonWidthClassName: "w-20",
    tooltipNoun: "", // Already formats value
    formatBucket: formatDuration,
    selectBucket: (b) => b.timeToFirstTokenNsMedian,
    selectMetricsValue: (m) => m.timeToFirstTokenNs.median,
  },
  spans: {
    id: "spans",
    label: "Total spans",
    cardSkeletonWidthClassName: "w-16",
    tooltipNoun: "spans",
    formatBucket: formatCount,
    selectBucket: (b) => b.spanCountSum,
    selectMetricsValue: (m) => m.spanCount.sum,
  },
}
