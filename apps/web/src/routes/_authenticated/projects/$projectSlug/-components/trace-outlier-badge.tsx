import { getTraceMetricPercentileThreshold, type TraceCohortMetric, type TraceCohortSummary } from "@domain/spans"
import { Status, type StatusProps, TagBadgeList, Text, Tooltip } from "@repo/ui"
import { formatCount, formatDuration, formatPrice } from "@repo/utils"
import { useTraceCohortSummaryByTags } from "../../../../../domains/traces/traces.collection.ts"

type Baselines = TraceCohortSummary["baselines"]
export type TraceOutlierMetric = keyof Baselines
export type TraceOutlierLevel = "p99" | "p95" | "p90"

const LEVEL_LABELS: Record<TraceOutlierLevel, string> = {
  p99: "99%",
  p95: "95%",
  p90: "90%",
}

const METRIC_LABELS: Record<TraceOutlierMetric, string> = {
  durationNs: "duration",
  timeToFirstTokenNs: "Time to First Token",
  costTotalMicrocents: "cost",
  tokensTotal: "tokens",
}

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

function levelVariant(level: TraceOutlierLevel | "p50"): NonNullable<StatusProps["variant"]> {
  switch (level) {
    case "p99":
      return "destructive"
    case "p95":
      return "warning"
    case "p90":
      return "info"
    case "p50":
      return "neutral"
  }
}

function formatValue({ value, metric }: { value: number; metric: TraceCohortMetric }): string {
  switch (metric) {
    case "durationNs":
      return formatDuration(value)
    case "costTotalMicrocents":
      return formatPrice(value / 100_000_000)
    case "tokensTotal":
      return formatCount(value)
    case "timeToFirstTokenNs":
      return formatDuration(value)
    default:
      return String(value)
  }
}

function CohortBaseline({
  cohorts,
  metric,
  level,
}: {
  cohorts: TraceCohortSummary
  metric: TraceCohortMetric
  level: TraceOutlierLevel | "p50"
}) {
  const baseline = cohorts.baselines[metric]
  // p50 has no sample-count gate — read it directly. p90/p95/p99 flow through
  // `getTraceMetricPercentileThreshold` so they return null when the cohort
  // is too small (matching `computeLevel`'s behavior).
  const value = level === "p50" ? baseline.p50 : getTraceMetricPercentileThreshold(baseline, level)
  return (
    <div className="flex items-center gap-1">
      <Status variant={levelVariant(level)} label={level} />
      <span className="text-sm text-muted-foreground">{value !== null ? formatValue({ value, metric }) : "-"}</span>
    </div>
  )
}

function TraceValueRow({ value, metric, p50 }: { value: number; metric: TraceCohortMetric; p50: number }) {
  const ratio = p50 > 0 ? value / p50 : null
  return (
    <div className="flex items-baseline justify-between gap-3">
      <Text.H6 color="foregroundMuted">This trace</Text.H6>
      <div className="flex items-baseline gap-2">
        <Text.H5 weight="medium">{formatValue({ value, metric })}</Text.H5>
        {ratio !== null && ratio >= 1.05 && <Text.H6 color="foregroundMuted">{ratio.toFixed(1)}× median</Text.H6>}
      </div>
    </div>
  )
}

function QuantileStrip({ baseline, value }: { baseline: Baselines[TraceOutlierMetric]; value: number }) {
  const p50 = baseline.p50
  const p90 = getTraceMetricPercentileThreshold(baseline, "p90")
  const p95 = getTraceMetricPercentileThreshold(baseline, "p95")
  const p99 = getTraceMetricPercentileThreshold(baseline, "p99")

  if (p50 <= 0) return null

  const zones: { upperBound: number; className: string }[] = [{ upperBound: p50, className: "bg-muted-foreground/25" }]
  if (p90 !== null) zones.push({ upperBound: p90, className: "bg-sky-400/60" })
  if (p95 !== null) zones.push({ upperBound: p95, className: "bg-amber-400/70" })
  if (p99 !== null) zones.push({ upperBound: p99, className: "bg-red-400/70" })

  // Extend the last zone to enclose the trace's value so the marker always lands
  // inside a colored region that matches its badge level.
  const last = zones[zones.length - 1]
  if (!last) return null
  if (value > last.upperBound) last.upperBound = value

  const max = last.upperBound * 1.05
  const pct = (v: number) => (v / max) * 100

  let cursor = 0
  const rendered = zones.map((z) => {
    const width = pct(z.upperBound - cursor)
    cursor = z.upperBound
    return { className: z.className, width }
  })

  return (
    <div className="relative h-1.5 rounded-full bg-muted">
      <div className="absolute inset-0 flex overflow-hidden rounded-full">
        {rendered.map((z, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: zones are positional and never reorder within one render
          <div key={i} className={z.className} style={{ flexBasis: `${z.width}%` }} />
        ))}
      </div>
      <div
        aria-hidden
        className="absolute -top-1 -bottom-1 w-0.5 bg-foreground rounded-sm"
        style={{ left: `${pct(value)}%`, transform: "translateX(-50%)" }}
      />
    </div>
  )
}

/**
 * A tooltip that explains that the outlier is only scoped to the subset of traces that match the given tags.
 * And then displays the baseline values for the given metric.
 */
function OutlierTooltip({
  tags,
  cohorts,
  metric,
  level,
  value,
}: {
  tags: ReadonlyArray<string>
  cohorts: TraceCohortSummary
  metric: TraceCohortMetric
  level: TraceOutlierLevel
  value: number
}) {
  const baseline = cohorts.baselines[metric]
  return (
    <div className="flex flex-col gap-4 min-w-64">
      <div className="flex flex-col gap-2">
        <Text.H6>
          This trace's <b>{METRIC_LABELS[metric]}</b> is greater than <b>{LEVEL_LABELS[level]}</b> of the traces with
          {tags.length === 0 ? "no tags." : tags.length === 1 ? "this tag:" : "these tags:"}
        </Text.H6>
        {tags.length > 0 && <TagBadgeList tags={tags} />}
      </div>
      <div className="flex flex-col gap-2">
        <TraceValueRow value={value} metric={metric} p50={baseline.p50} />
        <QuantileStrip baseline={baseline} value={value} />
      </div>
      <div className="flex flex-col gap-1">
        {/* p50 */}
        <CohortBaseline cohorts={cohorts} metric={metric} level="p50" />
        {/* p90 */}
        <CohortBaseline cohorts={cohorts} metric={metric} level="p90" />
        {/* p95 */}
        <CohortBaseline cohorts={cohorts} metric={metric} level="p95" />
        {/* p99 */}
        <CohortBaseline cohorts={cohorts} metric={metric} level="p99" />
      </div>
    </div>
  )
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
  if (!level || !data) return null

  const threshold = getTraceMetricPercentileThreshold(data.baselines[metric], level)
  const status = <Status variant={levelVariant(level)} label={level} />
  const trigger =
    onThresholdClick && threshold !== null ? (
      <button
        type="button"
        onClick={() => onThresholdClick(threshold, level)}
        className="cursor-pointer hover:opacity-80 transition-opacity"
      >
        {status}
      </button>
    ) : (
      <span>{status}</span>
    )

  return (
    <Tooltip asChild trigger={trigger}>
      <OutlierTooltip tags={tags} cohorts={data} metric={metric} level={level} value={value} />
    </Tooltip>
  )
}
