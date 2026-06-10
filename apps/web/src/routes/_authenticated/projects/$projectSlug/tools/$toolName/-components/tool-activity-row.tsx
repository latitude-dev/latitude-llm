import { Chart, type ChartSeries, HistogramSkeleton, Text } from "@repo/ui"
import { formatDuration } from "@repo/utils"
import { useMemo } from "react"
import { type ToolsTimeRange, useToolCallHistogram } from "../../../../../../../domains/tools/tools.collection.ts"
import { formatBucketLabel } from "../../-components/tool-formatters.ts"

const OK_CALLS_COLOR = "hsl(217 91% 60%)"
const FAILED_CALLS_COLOR = "hsl(0 70% 55%)"
const ERROR_RATE_COLOR = "hsl(35 90% 55%)"
const LATENCY_COLOR = "hsl(262 60% 60%)"

function ChartPanel({
  title,
  isLoading,
  isEmpty,
  emptyLabel,
  className,
  children,
}: {
  readonly title: string
  readonly isLoading: boolean
  readonly isEmpty: boolean
  readonly emptyLabel: string
  readonly className?: string
  readonly children: React.ReactNode
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-4 ${className ?? ""}`}>
      <Text.H6 color="foregroundMuted">{title}</Text.H6>
      {isLoading ? (
        <HistogramSkeleton height={200} />
      ) : isEmpty ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <Text.H6 color="foregroundMuted">{emptyLabel}</Text.H6>
        </div>
      ) : (
        children
      )}
    </div>
  )
}

/**
 * Activity row of the tool detail page: calls + failures over time (wide)
 * and p50 call latency over time (fixed aside).
 */
export function ToolActivityRow({
  projectId,
  toolName,
  range,
  bucketSeconds,
}: {
  readonly projectId: string
  readonly toolName: string
  readonly range: ToolsTimeRange
  readonly bucketSeconds: number
}) {
  const { data: histogram = [], isLoading } = useToolCallHistogram({
    projectId,
    toolName,
    range,
    bucketSeconds,
  })

  const categories = useMemo(
    () => histogram.map((bucket) => formatBucketLabel(bucket.bucketStart, bucketSeconds)),
    [histogram, bucketSeconds],
  )

  const callsSeries = useMemo<readonly ChartSeries[]>(
    () => [
      {
        kind: "bar",
        name: "Successful calls",
        values: histogram.map((bucket) => bucket.calls - bucket.errors),
        color: OK_CALLS_COLOR,
        axis: "left",
        stack: "calls",
      },
      {
        kind: "bar",
        name: "Failed calls",
        values: histogram.map((bucket) => bucket.errors),
        color: FAILED_CALLS_COLOR,
        axis: "left",
        stack: "calls",
      },
      {
        kind: "line",
        name: "Error rate %",
        values: histogram.map((bucket) =>
          bucket.calls > 0 ? Math.round((bucket.errors / bucket.calls) * 1000) / 10 : 0,
        ),
        color: ERROR_RATE_COLOR,
        axis: "right",
        smooth: true,
      },
    ],
    [histogram],
  )

  const latencySeries = useMemo<readonly ChartSeries[]>(
    () => [
      {
        kind: "line",
        name: "p50 duration (ms)",
        values: histogram.map((bucket) => Math.round(bucket.p50DurationNs / 1_000_000)),
        color: LATENCY_COLOR,
        axis: "left",
        area: true,
        smooth: true,
      },
    ],
    [histogram],
  )

  const isEmpty = histogram.length === 0 || histogram.every((bucket) => bucket.calls === 0)
  const latencyTooltipTitle = useMemo(
    () => (category: string, dataIndex: number) => {
      const bucket = histogram[dataIndex]
      return bucket ? `${category} · p50 ${formatDuration(bucket.p50DurationNs)}` : category
    },
    [histogram],
  )

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
      <ChartPanel
        title="Calls over time"
        isLoading={isLoading}
        isEmpty={isEmpty}
        emptyLabel="No calls in this time window"
        className="xl:flex-1"
      >
        <Chart
          categories={categories}
          series={callsSeries}
          height={200}
          xAxisLabelFontSize={10}
          ariaLabel={`Calls of ${toolName} over time`}
        />
      </ChartPanel>
      <ChartPanel
        title="Latency over time"
        isLoading={isLoading}
        isEmpty={isEmpty}
        emptyLabel="No calls in this time window"
        className="xl:w-[420px]"
      >
        <Chart
          categories={categories}
          series={latencySeries}
          height={200}
          xAxisLabelFontSize={10}
          tooltipTitle={latencyTooltipTitle}
          ariaLabel={`p50 latency of ${toolName} over time`}
        />
      </ChartPanel>
    </div>
  )
}
