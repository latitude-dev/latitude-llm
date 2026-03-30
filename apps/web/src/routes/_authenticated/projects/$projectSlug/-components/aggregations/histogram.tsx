import type { FilterSet } from "@domain/shared"
import { denseTraceTimeHistogramBuckets } from "@domain/spans"
import { BarChart, ChartSkeleton, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { useMemo } from "react"

import { useTraceTimeHistogram } from "../../../../../../domains/traces/traces.collection.ts"

function formatBucketAxisLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function Histogram({ projectId, filters }: { readonly projectId: string; readonly filters: FilterSet }) {
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

  const chartData = useMemo(
    () =>
      denseBuckets.map((b) => ({
        category: formatBucketAxisLabel(b.bucketStart),
        value: b.traceCount,
      })),
    [denseBuckets],
  )

  if (isLoading) {
    return (
      <div className="px-4 py-3">
        <ChartSkeleton minHeight={160} className="border-0 bg-transparent p-0" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex w-full min-h-[80px] items-center justify-center px-4 py-3">
        <Text.H6 color="destructive">Could not load histogram</Text.H6>
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
        ariaLabel="Trace count by time bucket"
        formatTooltip={(category, value) => `${category}<br/><b>${formatCount(value)}</b> traces`}
      />
    </div>
  )
}
