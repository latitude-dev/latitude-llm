import type { CostSeriesMetric } from "@domain/spans"
import { Chart, type ChartSeries, HistogramSkeleton, Tabs, Text } from "@repo/ui"
import { formatPrice } from "@repo/utils"
import type { CostSeriesBucketRecord } from "../../../../../../domains/cost/cost.functions.ts"
import { ChartHeader } from "../../-components/chart-header.tsx"
import {
  bucketUnitLabel,
  formatUtcBucketLabel,
  formatUtcBucketRange,
  isCostSeriesMetric,
  microcentsToUsd,
} from "./cost-formatters.ts"

const CHART_HEIGHT = 220

// Stack colours for the per-model breakdown, ordered so the biggest spender
// (drawn first, at the baseline) gets the strongest hue.
const MODEL_COLORS: readonly string[] = [
  "hsl(217 91% 60%)",
  "hsl(262 83% 63%)",
  "hsl(291 64% 55%)",
  "hsl(174 62% 42%)",
  "hsl(35 90% 55%)",
  "hsl(0 70% 55%)",
  "hsl(199 89% 48%)",
  "hsl(84 60% 45%)",
  "hsl(211 11% 55%)",
]

const TREND_COLOR = "hsl(217 91% 60%)"

const METRIC_OPTIONS: readonly { readonly id: CostSeriesMetric; readonly label: string; readonly tooltip: string }[] = [
  { id: "total", label: "Total", tooltip: "Spend per bucket, stacked by model." },
  { id: "average", label: "Average", tooltip: "Mean cost of a trace in the bucket." },
  { id: "p95", label: "p95", tooltip: "95th percentile trace cost in the bucket — the expensive tail." },
]

const modelLabel = (model: string): string => model || "unknown model"

/**
 * Series for the additive metric: one stacked bar segment per model, biggest
 * spender at the baseline so stacks stay comparable across buckets.
 */
function buildStackedModelSeries({
  buckets,
  provisionalIndex,
}: {
  readonly buckets: readonly CostSeriesBucketRecord[]
  readonly provisionalIndex: number | undefined
}): readonly ChartSeries[] {
  const spendByModel = new Map<string, number>()
  for (const bucket of buckets) {
    for (const slice of bucket.byModel) {
      spendByModel.set(slice.model, (spendByModel.get(slice.model) ?? 0) + slice.costMicrocents)
    }
  }
  const models = [...spendByModel.entries()].sort(([, a], [, b]) => b - a).map(([model]) => model)

  return models.map((model, index) => ({
    kind: "bar" as const,
    name: modelLabel(model),
    values: buckets.map((bucket) =>
      microcentsToUsd(bucket.byModel.find((slice) => slice.model === model)?.costMicrocents ?? 0),
    ),
    color: MODEL_COLORS[index % MODEL_COLORS.length] ?? TREND_COLOR,
    stack: "cost",
    ...(provisionalIndex === undefined ? {} : { provisionalIndex }),
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
  const unit = bucketUnitLabel(bucketSeconds)
  const categories = buckets.map((bucket) => formatUtcBucketLabel(bucket.bucketStartIso, bucketSeconds))
  // Total is additive, so bars stack by model and their area means something.
  // Average and p95 summarise a distribution that does not accumulate — a line.
  const series: readonly ChartSeries[] =
    metric === "total"
      ? buildStackedModelSeries({ buckets, provisionalIndex })
      : [
          {
            kind: "line",
            name: metric === "p95" ? "p95 cost per trace" : "Avg cost per trace",
            values: buckets.map((bucket) => microcentsToUsd(bucket.valueMicrocents)),
            color: TREND_COLOR,
            ...(provisionalIndex === undefined ? {} : { provisionalIndex }),
          },
        ]
  const isEmpty = buckets.length === 0 || buckets.every((bucket) => bucket.valueMicrocents === 0)

  return (
    <div className="flex flex-col rounded-lg bg-secondary">
      <ChartHeader
        title="Cost over time"
        fromIso={rangeFromIso}
        toIso={rangeToIso}
        isAllTime={isAllTime}
        actions={
          <Tabs
            variant="bordered"
            size="sm"
            className="border-none bg-muted"
            indicatorClassName="border-none"
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
        <div className="flex w-full min-h-[120px] items-center justify-center px-4 py-3">
          <Text.H6 color="foregroundMuted">No billable LLM usage in this time window</Text.H6>
        </div>
      ) : (
        <div className="flex flex-col gap-1 px-4 py-3">
          <Chart
            categories={categories}
            series={series}
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
          {provisionalIndex === undefined ? null : (
            <Text.H6 color="foregroundMuted">
              {/* A zero current bucket draws nothing, so naming the marking would point at empty space. */}
              {(buckets[provisionalIndex]?.valueMicrocents ?? 0) > 0
                ? `The ${metric === "total" ? "hatched" : "dashed"} ${unit} is still in progress.`
                : `No spend recorded yet in the current ${unit} (UTC).`}
            </Text.H6>
          )}
        </div>
      )}
    </div>
  )
}
