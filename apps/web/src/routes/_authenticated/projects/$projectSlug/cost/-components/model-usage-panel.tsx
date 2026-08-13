import { Chart, type ChartSeries, HistogramSkeleton, Tabs, useChartCssTheme } from "@repo/ui"
import { formatCount, formatPrice } from "@repo/utils"
import { CircleDollarSignIcon, HashIcon } from "lucide-react"
import type { ModelUsageSeriesRecord } from "../../../../../../domains/cost/cost.functions.ts"
import { ChartHeader } from "../../-components/chart-header.tsx"
import {
  bucketUnitLabel,
  formatUtcBucketLabel,
  formatUtcBucketRange,
  isModelUsageMeasure,
  type ModelUsageMeasure,
  microcentsToUsd,
} from "./cost-formatters.ts"
import { modelColorAt, otherSeriesColor } from "./cost-series-colors.ts"
import { EmptyState } from "./empty-state.tsx"

const CHART_HEIGHT = 260

const MEASURE_OPTIONS: readonly { readonly id: ModelUsageMeasure; readonly label: string; readonly tooltip: string }[] =
  [
    { id: "cost", label: "Cost", tooltip: "Spend per model per bucket." },
    { id: "tokens", label: "Tokens", tooltip: "Tokens per model per bucket — volume, not money." },
  ]

const modelLabel = (model: string): string => model || "unknown model"

const otherLabel = (otherModels: number): string =>
  otherModels === 1 ? "Other (1 model)" : `Other (${otherModels} models)`

interface UsageSeries {
  readonly name: string
  readonly color: string
  readonly values: readonly number[]
}

function buildUsageSeries({
  series,
  measure,
  isDark,
}: {
  readonly series: ModelUsageSeriesRecord
  readonly measure: ModelUsageMeasure
  readonly isDark: boolean
}): readonly UsageSeries[] {
  const measureOf = (slice: { readonly costMicrocents: number; readonly tokens: number }): number =>
    measure === "cost" ? microcentsToUsd(slice.costMicrocents) : slice.tokens

  const modelSeries = series.models.map((model, index) => ({
    name: modelLabel(model),
    color: modelColorAt(index, isDark),
    values: series.buckets.map((bucket) => {
      const slice = bucket.byModel.find((entry) => entry.model === model)
      return slice ? measureOf(slice) : 0
    }),
  }))

  if (series.otherModels <= 0) return modelSeries
  return [
    ...modelSeries,
    {
      name: otherLabel(series.otherModels),
      color: otherSeriesColor(isDark),
      values: series.buckets.map((bucket) => measureOf(bucket.other)),
    },
  ]
}

/**
 * Cost or tokens per model over time. Both measures come from one payload and share
 * one spend-ranked series set, so toggling changes the axis and nothing else.
 */
export function ModelUsagePanel({
  series,
  measure,
  onMeasureChange,
  bucketSeconds,
  provisionalIndex,
  rangeFromIso,
  rangeToIso,
  isAllTime,
  isLoading,
}: {
  readonly series: ModelUsageSeriesRecord | undefined
  readonly measure: ModelUsageMeasure
  readonly onMeasureChange: (measure: ModelUsageMeasure) => void
  readonly bucketSeconds: number
  readonly provisionalIndex: number | undefined
  readonly rangeFromIso: string
  readonly rangeToIso: string
  readonly isAllTime: boolean
  readonly isLoading: boolean
}) {
  const { isDark } = useChartCssTheme()
  const unit = bucketUnitLabel(bucketSeconds)
  const buckets = series?.buckets ?? []
  const usageSeries = series ? buildUsageSeries({ series, measure, isDark }) : []
  const isEmpty = usageSeries.every((entry) => entry.values.every((value) => value === 0))
  const chartSeries: readonly ChartSeries[] = usageSeries.map((entry) => ({
    kind: "line" as const,
    name: entry.name,
    values: entry.values,
    color: entry.color,
  }))

  return (
    <div className="flex flex-1 flex-col rounded-lg border border-border bg-background">
      <ChartHeader
        title="Model usage over time"
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
            className="border-none bg-muted"
            indicatorClassName="border-none"
            options={MEASURE_OPTIONS.map((option) => ({
              id: option.id,
              label: option.label,
              tooltip: option.tooltip,
            }))}
            active={measure}
            onSelect={(value) => {
              if (isModelUsageMeasure(value)) onMeasureChange(value)
            }}
          />
        }
      />
      {isLoading ? (
        <div className="px-4 py-3">
          <HistogramSkeleton height={CHART_HEIGHT} />
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={measure === "cost" ? CircleDollarSignIcon : HashIcon}
          message={
            measure === "cost" ? "No spend recorded in this time window" : "No token usage recorded in this time window"
          }
        />
      ) : (
        <div className="flex flex-col gap-1 px-4 py-3">
          <Chart
            categories={buckets.map((bucket) => formatUtcBucketLabel(bucket.bucketStartIso, bucketSeconds))}
            series={chartSeries}
            height={CHART_HEIGHT}
            xAxisLabelFontSize={10}
            primaryAxis={{
              name: measure === "cost" ? `$/${unit}` : `tokens/${unit}`,
              minInterval: measure === "cost" ? 0 : 1,
              formatValue: (value) => (measure === "cost" ? formatPrice(value) : formatCount(value)),
            }}
            tooltipTitle={(_category, dataIndex) => {
              const bucket = buckets[dataIndex]
              if (!bucket) return ""
              const range = formatUtcBucketRange(bucket.bucketStartIso, bucketSeconds)
              return dataIndex === provisionalIndex ? `${range} · still in progress` : range
            }}
            ariaLabel="Model usage over time"
          />
        </div>
      )}
    </div>
  )
}
