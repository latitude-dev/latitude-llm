import type { FilterSet } from "@domain/shared"
import { Skeleton, Text } from "@repo/ui"
import { formatCount, formatDuration, formatPrice } from "@repo/utils"
import { useTraceMetrics, useTracesCount } from "../../../../../../domains/traces/traces.collection.ts"

function AggregationItem({
  label,
  value,
  isLoading,
  skeletonWidthClassName = "w-16",
}: {
  readonly label: string
  readonly value: string
  readonly isLoading?: boolean
  readonly skeletonWidthClassName?: string
}) {
  return (
    <div className="flex basis-[176px] min-w-[176px] shrink-0 flex-col gap-2">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      {isLoading ? (
        <Skeleton className={`h-5 ${skeletonWidthClassName}`} />
      ) : (
        <Text.H5 color="foreground" className="tabular-nums">
          {value}
        </Text.H5>
      )}
    </div>
  )
}

export function GeneralAggregations({
  projectId,
  filters,
}: {
  readonly projectId: string
  readonly filters: FilterSet
}) {
  const hasActiveFilters = Object.keys(filters).length > 0
  const filterOpts = hasActiveFilters ? { filters } : {}

  const { data: traceMetrics, isLoading: metricsLoading } = useTraceMetrics({
    projectId,
    ...filterOpts,
  })
  const { totalCount, isLoading: countLoading } = useTracesCount({
    projectId,
    ...filterOpts,
  })

  const loading = metricsLoading || countLoading

  const dash = "—"
  const traceCountStr = formatCount(totalCount)
  const totalCostStr = traceMetrics ? formatPrice(traceMetrics.costTotalMicrocents.sum / 100_000_000) : dash
  const medianDurationStr = traceMetrics ? formatDuration(traceMetrics.durationNs.median) : dash
  const totalTokensStr = traceMetrics ? formatCount(traceMetrics.tokensTotal.sum) : dash
  const totalSpansStr = traceMetrics ? formatCount(traceMetrics.spanCount.sum) : dash

  const showTtftAggregations = traceMetrics && traceMetrics.timeToFirstTokenNs.max > 0

  return (
    <div className="flex flex-row flex-wrap gap-3 p-4">
      <AggregationItem label="Traces" value={traceCountStr} isLoading={loading} skeletonWidthClassName="w-16" />
      <AggregationItem label="Total cost" value={totalCostStr} isLoading={loading} skeletonWidthClassName="w-20" />
      <AggregationItem
        label="Median duration"
        value={medianDurationStr}
        isLoading={loading}
        skeletonWidthClassName="w-20"
      />
      <AggregationItem label="Total tokens" value={totalTokensStr} isLoading={loading} skeletonWidthClassName="w-20" />
      {showTtftAggregations ? (
        <AggregationItem
          label="Median time to first token"
          value={formatDuration(traceMetrics.timeToFirstTokenNs.median)}
        />
      ) : null}
      <AggregationItem label="Total spans" value={totalSpansStr} isLoading={loading} skeletonWidthClassName="w-16" />
    </div>
  )
}
