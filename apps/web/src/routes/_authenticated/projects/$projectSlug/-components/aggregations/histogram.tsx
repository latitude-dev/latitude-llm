import type { FilterSet } from "@domain/shared"
import { denseTraceTimeHistogramBuckets, type TraceHistogramMetric } from "@domain/spans"
import { BarChart, HistogramSkeleton, Text } from "@repo/ui"
import { useCallback, useMemo } from "react"

import { useTraceTimeHistogram } from "../../../../../../domains/traces/traces.collection.ts"
import { HISTOGRAM_METRIC_DEFINITIONS } from "./histogram-metrics.ts"

function formatBucketAxisLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

interface HistogramProps {
  readonly projectId: string
  readonly filters: FilterSet
  readonly metric: TraceHistogramMetric
  /** Called when user selects a time range via brush on the histogram. */
  readonly onRangeSelect?: ((range: { from: string; to: string } | null) => void) | undefined
}

export function Histogram({ projectId, filters, metric, onRangeSelect }: HistogramProps) {
  const {
    data: sparseBuckets,
    isLoading,
    isError,
    rangeStartIso,
    rangeEndIso,
    bucketSeconds,
  } = useTraceTimeHistogram({ projectId, filters })

  const denseBuckets = useMemo(
    () => denseTraceTimeHistogramBuckets(sparseBuckets, rangeStartIso, rangeEndIso, bucketSeconds),
    [sparseBuckets, rangeStartIso, rangeEndIso, bucketSeconds],
  )

  const definition = HISTOGRAM_METRIC_DEFINITIONS[metric]

  const chartData = useMemo(
    () =>
      denseBuckets.map((b) => ({
        category: formatBucketAxisLabel(b.bucketStart),
        value: definition.selectBucket(b),
      })),
    [denseBuckets, definition],
  )

  const handleSelect = useCallback(
    (range: { startIndex: number; endIndex: number } | null) => {
      if (!onRangeSelect) return
      if (!range) {
        onRangeSelect(null)
        return
      }
      const startBucket = denseBuckets[range.startIndex]
      const endBucket = denseBuckets[range.endIndex]
      if (!startBucket || !endBucket) return
      const from = startBucket.bucketStart
      const toEndMs = Date.parse(endBucket.bucketStart) + bucketSeconds * 1000
      const to = new Date(toEndMs).toISOString()
      onRangeSelect({ from, to })
    },
    [denseBuckets, bucketSeconds, onRangeSelect],
  )

  const formatTooltip = useCallback(
    (category: string, value: number) =>
      `${category}<br/><b>${definition.formatBucket(value)}</b> ${definition.tooltipNoun}`,
    [definition],
  )

  if (isLoading) {
    return (
      <div className="px-4 py-3">
        <HistogramSkeleton height={160} />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex w-full min-h-[80px] items-center justify-center px-4 py-3">
        <Text.H6 color="destructive">Could not load analytics</Text.H6>
      </div>
    )
  }

  if (denseBuckets.length === 0) {
    return (
      <div className="flex w-full min-h-[80px] items-center justify-center px-4 py-3">
        <Text.H6 color="foregroundMuted">No traces in this time window</Text.H6>
      </div>
    )
  }

  return (
    <div className="px-4 py-3">
      <BarChart
        data={chartData}
        height={160}
        showYAxis={false}
        ariaLabel={`${definition.label} by time bucket`}
        formatTooltip={formatTooltip}
        onSelect={onRangeSelect ? handleSelect : undefined}
      />
    </div>
  )
}
