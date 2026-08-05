import { Button, Chart, type ChartSeries, cn, HistogramSkeleton, Tabs, Text, useChartCssTheme } from "@repo/ui"
import { formatCount, formatPrice } from "@repo/utils"
import { useState } from "react"
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
import { ExpandableLegend } from "./expandable-legend.tsx"

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

/** Click-to-isolate, so a model outside the charted ranks is still reachable by muting the rest. */
function UsageLegend({
  series,
  isolated,
  onIsolate,
}: {
  readonly series: readonly UsageSeries[]
  readonly isolated: string | null
  readonly onIsolate: (name: string | null) => void
}) {
  return (
    <ExpandableLegend
      entries={series.map((entry) => ({ ...entry, key: entry.name }))}
      renderEntry={(entry) => {
        const isMuted = isolated !== null && isolated !== entry.name
        return (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onIsolate(isolated === entry.name ? null : entry.name)}
            aria-pressed={isolated === entry.name}
            className={cn({ "opacity-50": isMuted })}
          >
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: entry.color }} aria-hidden="true" />
            {entry.name}
          </Button>
        )
      }}
    />
  )
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
  const [isolated, setIsolated] = useState<string | null>(null)
  const { isDark } = useChartCssTheme()
  const unit = bucketUnitLabel(bucketSeconds)
  const buckets = series?.buckets ?? []
  const usageSeries = series ? buildUsageSeries({ series, measure, isDark }) : []
  const isEmpty = usageSeries.every((entry) => entry.values.every((value) => value === 0))
  // Falls back rather than resetting state: a model isolated before a range change
  // may not survive the re-ranking, and filtering to a name that is gone draws nothing.
  const isolatedSeries = isolated === null ? [] : usageSeries.filter((entry) => entry.name === isolated)
  const visible = isolatedSeries.length > 0 ? isolatedSeries : usageSeries
  const chartSeries: readonly ChartSeries[] = visible.map((entry) => ({
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
        <div className="flex w-full min-h-[120px] items-center justify-center px-4 py-3">
          <Text.H6 color="foregroundMuted">
            {measure === "cost"
              ? "No spend recorded in this time window"
              : "No token usage recorded in this time window"}
          </Text.H6>
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-4 py-3">
          <UsageLegend
            series={usageSeries}
            isolated={isolatedSeries.length > 0 ? isolated : null}
            onIsolate={setIsolated}
          />
          <Chart
            categories={buckets.map((bucket) => formatUtcBucketLabel(bucket.bucketStartIso, bucketSeconds))}
            series={chartSeries}
            height={CHART_HEIGHT}
            hideLegend
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
          <Text.H6 color="foregroundMuted">
            {/* Ranking by volume would crowd out the expensive model that is the story. */}
            Top {series?.models.length ?? 0} models by spend in this window
            {(series?.otherModels ?? 0) > 0 ? `; the remaining ${series?.otherModels} are grouped as Other` : null}.
            Select a model to isolate it.
          </Text.H6>
        </div>
      )}
    </div>
  )
}
