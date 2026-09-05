import type { CostSeriesMetric } from "@domain/spans"
import { Chart, type ChartSeries, EmptyState, HistogramSkeleton, Tabs, useChartCssTheme } from "@repo/ui"
import { formatPrice } from "@repo/utils"
import { CircleDollarSignIcon } from "lucide-react"
import type { CostSeriesBucketRecord } from "../../../../../../domains/cost/cost.functions.ts"
import { ChartHeader } from "../../-components/chart-header.tsx"
import {
  bucketUnitLabel,
  formatUtcBucketLabel,
  formatUtcBucketRange,
  isCostSeriesMetric,
  microcentsToUsd,
} from "./cost-formatters.ts"
import { modelColorAt, trendColor } from "./cost-series-colors.ts"

const CHART_HEIGHT = 220

const METRIC_OPTIONS: readonly { readonly id: CostSeriesMetric; readonly label: string; readonly tooltip: string }[] = [
  { id: "total", label: "Total", tooltip: "Spend per bucket, stacked by model." },
  { id: "average", label: "Average", tooltip: "Mean cost of a trace in the bucket." },
  { id: "p95", label: "p95", tooltip: "95th percentile trace cost in the bucket — the expensive tail." },
]

const modelLabel = (model: string): string => model || "unknown model"

/**
 * `step: "end"` holds a bucket's value from its own tick to the *next* tick, so the last
 * real bucket has no next tick to hold toward — it draws as a bare point with no plateau,
 * which can leave a single-bucket window looking empty despite having spend. Repeating the
 * last tick's label and every series' last value gives that final plateau somewhere to end.
 * `tooltipTitle` below already returns `""` past the real bucket count, so the extra point
 * never claims a bucket that doesn't exist.
 */
function padTrailingStepBoundary(
  categories: readonly string[],
  series: readonly ChartSeries[],
): { readonly categories: readonly string[]; readonly series: readonly ChartSeries[] } {
  if (categories.length === 0) return { categories, series }
  return {
    categories: [...categories, categories[categories.length - 1]],
    series: series.map((s) => ({ ...s, values: [...s.values, s.values[s.values.length - 1] ?? 0] })),
  }
}

/**
 * Series for the additive metric: one stacked step-area band per model, biggest
 * spender at the baseline so stacks stay comparable across buckets.
 *
 * `step: "end"` — labels mark each bucket's *start*, so a bucket's value has to
 * hold flat from its own tick through to the next bucket's tick, then jump.
 * That is `step: "end"`'s behaviour, not `"start"`'s: "start" would jump right
 * after this tick and hold flat at the *next* bucket's value instead.
 */
function buildStackedModelSeries({
  buckets,
  isDark,
}: {
  readonly buckets: readonly CostSeriesBucketRecord[]
  readonly isDark: boolean
}): readonly ChartSeries[] {
  const spendByModel = new Map<string, number>()
  for (const bucket of buckets) {
    for (const slice of bucket.byModel) {
      spendByModel.set(slice.model, (spendByModel.get(slice.model) ?? 0) + slice.costMicrocents)
    }
  }
  const models = [...spendByModel.entries()].sort(([, a], [, b]) => b - a).map(([model]) => model)

  return models.map((model, index) => ({
    kind: "line" as const,
    name: modelLabel(model),
    values: buckets.map((bucket) =>
      microcentsToUsd(bucket.byModel.find((slice) => slice.model === model)?.costMicrocents ?? 0),
    ),
    color: modelColorAt(index, isDark),
    stack: "cost",
    area: true,
    step: "end" as const,
  }))
}

export function CostOverTimePanel({
  buckets,
  metric,
  onMetricChange,
  bucketSeconds,
  provisionalIndex,
  rangeFromIso,
  rangeToIso,
  isAllTime,
  isLoading,
}: {
  readonly buckets: readonly CostSeriesBucketRecord[]
  readonly metric: CostSeriesMetric
  readonly onMetricChange: (metric: CostSeriesMetric) => void
  readonly bucketSeconds: number
  readonly provisionalIndex: number | undefined
  readonly rangeFromIso: string
  readonly rangeToIso: string
  readonly isAllTime: boolean
  readonly isLoading: boolean
}) {
  const { isDark } = useChartCssTheme()
  const unit = bucketUnitLabel(bucketSeconds)
  const categories = buckets.map((bucket) => formatUtcBucketLabel(bucket.bucketStartIso, bucketSeconds))
  // Total is additive, so its bands stack by model and their area means something.
  // Average and p95 summarise a distribution that does not accumulate — one band.
  // Both read as step areas: a bucket's value holds rather than drifting toward
  // the next one, which is what the data actually did.
  const series: readonly ChartSeries[] =
    metric === "total"
      ? buildStackedModelSeries({ buckets, isDark })
      : [
          {
            kind: "line",
            name: metric === "p95" ? "p95 cost per trace" : "Avg cost per trace",
            values: buckets.map((bucket) => microcentsToUsd(bucket.valueMicrocents)),
            color: trendColor(isDark),
            area: true,
            step: "end" as const,
          },
        ]
  // Reads as spend, not usage: an all-free-priced window also sums to zero.
  const isEmpty = buckets.length === 0 || buckets.every((bucket) => bucket.valueMicrocents === 0)
  const { categories: chartCategories, series: chartSeries } = padTrailingStepBoundary(categories, series)

  return (
    <div className="flex flex-col rounded-lg border border-border bg-background">
      <ChartHeader
        title="Cost over time"
        fromIso={rangeFromIso}
        toIso={rangeToIso}
        isAllTime={isAllTime}
        // The picker above states this window already, and the recent-activity
        // distinction that other dashboards flag isn't relevant to this panel.
        showWindow={false}
        titleColor="foregroundMuted"
        actions={
          <Tabs
            variant="bordered"
            size="sm"
            options={METRIC_OPTIONS.map((option) => ({
              id: option.id,
              label: option.label,
              tooltip: option.tooltip,
            }))}
            active={metric}
            onSelect={(value) => {
              if (isCostSeriesMetric(value)) onMetricChange(value)
            }}
          />
        }
      />
      {isLoading ? (
        <div className="px-4 py-3">
          <HistogramSkeleton height={CHART_HEIGHT} />
        </div>
      ) : isEmpty ? (
        <EmptyState icon={CircleDollarSignIcon} message="No spend recorded in this time window" />
      ) : (
        <div className="flex flex-col gap-1 px-4 py-3">
          <Chart
            categories={chartCategories}
            series={chartSeries}
            height={CHART_HEIGHT}
            xAxisLabelFontSize={10}
            primaryAxis={{
              name: metric === "total" ? `$/${unit}` : "$/trace",
              minInterval: 0,
              formatValue: (value) => formatPrice(value),
            }}
            tooltipTitle={(_category, dataIndex) => {
              const bucket = buckets[dataIndex]
              if (!bucket) return ""
              const range = formatUtcBucketRange(bucket.bucketStartIso, bucketSeconds)
              return dataIndex === provisionalIndex ? `${range} · still in progress` : range
            }}
            ariaLabel="Cost over time"
          />
        </div>
      )}
    </div>
  )
}
