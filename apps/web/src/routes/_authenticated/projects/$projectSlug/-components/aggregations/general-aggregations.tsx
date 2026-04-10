import type { FilterSet } from "@domain/shared"
import { Text } from "@repo/ui"
import { formatCount, formatDuration, formatPrice } from "@repo/utils"
import { useTraceMetrics, useTracesCount } from "../../../../../../domains/traces/traces.collection.ts"

function AggregationItem({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex basis-[176px] min-w-[176px] shrink-0 flex-col gap-2">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      <Text.H5 color="foreground" className="tabular-nums">
        {value}
      </Text.H5>
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
  const ellip = "…"

  const traceCountStr = loading ? ellip : formatCount(totalCount)

  const totalCostStr = loading
    ? ellip
    : traceMetrics
      ? formatPrice(traceMetrics.costTotalMicrocents.sum / 100_000_000)
      : dash

  const medianDurationStr = loading ? ellip : traceMetrics ? formatDuration(traceMetrics.durationNs.median) : dash

  const totalTokensStr = loading ? ellip : traceMetrics ? formatCount(traceMetrics.tokensTotal.sum) : dash

  const totalSpansStr = loading ? ellip : traceMetrics ? formatCount(traceMetrics.spanCount.sum) : dash

  const showTtftAggregations = traceMetrics && traceMetrics.timeToFirstTokenNs.max > 0

  return (
    <div className="flex flex-row flex-wrap gap-3 p-4">
      <AggregationItem label="Traces" value={traceCountStr} />
      <AggregationItem label="Total cost" value={totalCostStr} />
      <AggregationItem label="Median duration" value={medianDurationStr} />
      <AggregationItem label="Total tokens" value={totalTokensStr} />
      {showTtftAggregations ? (
        <AggregationItem
          label="Median time to first token"
          value={formatDuration(traceMetrics.timeToFirstTokenNs.median)}
        />
      ) : null}
      <AggregationItem label="Total spans" value={totalSpansStr} />
    </div>
  )
}
