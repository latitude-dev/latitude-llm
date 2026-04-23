import { getTraceMetricPercentileThreshold, type TraceCohortSummary } from "@domain/spans"
import { Status, type StatusProps } from "@repo/ui"
import { useTraceCohortSummaryByTags } from "../../../../../domains/traces/traces.collection.ts"

type Baselines = TraceCohortSummary["baselines"]
export type TraceOutlierMetric = keyof Baselines
export type TraceOutlierLevel = "p99" | "p95" | "p90"

function computeLevel(
  value: number,
  baseline: Baselines[TraceOutlierMetric] | undefined,
): TraceOutlierLevel | undefined {
  if (!baseline || value <= 0) return undefined
  const p99 = getTraceMetricPercentileThreshold(baseline, "p99")
  if (p99 !== null && value >= p99) return "p99"
  const p95 = getTraceMetricPercentileThreshold(baseline, "p95")
  if (p95 !== null && value >= p95) return "p95"
  const p90 = getTraceMetricPercentileThreshold(baseline, "p90")
  if (p90 !== null && value >= p90) return "p90"
  return undefined
}

function levelVariant(level: TraceOutlierLevel): NonNullable<StatusProps["variant"]> {
  switch (level) {
    case "p99":
      return "destructive"
    case "p95":
      return "warning"
    case "p90":
      return "info"
  }
}

/**
 * Renders a p90/p95/p99 outlier badge when a trace's metric value exceeds the
 * percentile thresholds of its tag-scoped cohort. The cohort baseline is fetched
 * lazily per trace via `useTraceCohortSummaryByTags` — TanStack Query dedupes
 * across rows sharing a tag combination.
 *
 * When `onThresholdClick` is provided the badge becomes a button that reports
 * the numeric threshold of the matched level (useful for filter-by-threshold).
 */
export function TraceOutlierBadge({
  projectId,
  tags,
  value,
  metric,
  onThresholdClick,
}: {
  readonly projectId: string
  readonly tags: ReadonlyArray<string>
  readonly value: number
  readonly metric: TraceOutlierMetric
  readonly onThresholdClick?: ((threshold: number, level: TraceOutlierLevel) => void) | undefined
}) {
  const { data } = useTraceCohortSummaryByTags({ projectId, tags })
  const level = computeLevel(value, data?.baselines[metric])
  if (!level) return null

  const status = <Status variant={levelVariant(level)} label={level} />
  if (!onThresholdClick || !data) return status

  const threshold = getTraceMetricPercentileThreshold(data.baselines[metric], level)
  if (threshold === null) return status

  return (
    <button
      type="button"
      onClick={() => onThresholdClick(threshold, level)}
      className="cursor-pointer hover:opacity-80 transition-opacity"
    >
      {status}
    </button>
  )
}
