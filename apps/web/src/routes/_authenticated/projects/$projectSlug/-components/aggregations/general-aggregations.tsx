import type { FilterSet } from "@domain/shared"
import type { TraceHistogramMetric } from "@domain/spans"
import { cn, Skeleton, Text } from "@repo/ui"
import { useTraceMetrics, useTracesCount } from "../../../../../../domains/traces/traces.collection.ts"
import { HISTOGRAM_METRIC_DEFINITIONS, type HistogramMetricDefinition } from "./histogram-metrics.ts"

function AggregationItem({
  label,
  value,
  isLoading,
  isSelected,
  skeletonWidthClassName = "w-16",
  onClick,
}: {
  readonly label: string
  readonly value: string
  readonly isLoading?: boolean
  readonly isSelected: boolean
  readonly skeletonWidthClassName?: string
  readonly onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={cn(
        "flex basis-[176px] min-w-[176px] shrink-0 cursor-pointer flex-col gap-2 rounded-md p-2 text-left",
        "transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isSelected && "bg-muted ring-1 ring-border",
      )}
    >
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      {isLoading ? (
        <Skeleton className={`h-5 ${skeletonWidthClassName}`} />
      ) : (
        <Text.H5 color="foreground" className="tabular-nums">
          {value}
        </Text.H5>
      )}
    </button>
  )
}

const DASH = "—"

const METRIC_ORDER: readonly TraceHistogramMetric[] = ["traces", "cost", "duration", "tokens", "ttft", "spans"]

export function GeneralAggregations({
  projectId,
  filters,
  selectedMetric,
  onMetricSelect,
}: {
  readonly projectId: string
  readonly filters: FilterSet
  readonly selectedMetric: TraceHistogramMetric
  readonly onMetricSelect: (metric: TraceHistogramMetric) => void
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

  // TTFT card is hidden when no trace in the current view recorded a first-token timestamp
  // (`> 0`); showing it would just render "—" forever for projects that don't stream.
  const showTtft = !!traceMetrics && traceMetrics.timeToFirstTokenNs.max > 0

  const visibleMetrics = METRIC_ORDER.filter((id) => id !== "ttft" || showTtft).map(
    (id) => HISTOGRAM_METRIC_DEFINITIONS[id],
  )

  const renderValue = (def: HistogramMetricDefinition): string => {
    if (def.id === "traces") return def.formatBucket(totalCount)
    if (!traceMetrics) return DASH
    return def.formatBucket(def.selectMetricsValue(traceMetrics, totalCount))
  }

  return (
    <div className="flex flex-row flex-wrap gap-1 p-2">
      {visibleMetrics.map((def) => (
        <AggregationItem
          key={def.id}
          label={def.label}
          value={renderValue(def)}
          isLoading={loading}
          isSelected={selectedMetric === def.id}
          skeletonWidthClassName={def.cardSkeletonWidthClassName}
          onClick={() => onMetricSelect(def.id)}
        />
      ))}
    </div>
  )
}
