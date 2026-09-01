import type { FilterSet } from "@domain/shared"
import type { SessionMetrics, TraceHistogramMetric, TraceMetrics } from "@domain/spans"
import { Button, cn, Icon, Skeleton, Text } from "@repo/ui"
import { ChevronUp } from "lucide-react"
import { useState } from "react"
import { useSessionMetrics, useSessionsCount } from "../../../../../../domains/sessions/sessions.collection.ts"
import { useTraceMetrics, useTracesCount } from "../../../../../../domains/traces/traces.collection.ts"
import {
  type AggregationsMode,
  HISTOGRAM_METRIC_DEFINITIONS,
  type HistogramMetricDefinition,
  metricOrderForMode,
  unitNounForMode,
} from "./histogram-metrics.ts"

function AggregationItem({
  label,
  value,
  subValue,
  isLoading,
  isSelected,
  skeletonWidthClassName = "w-16",
  onClick,
}: {
  readonly label: string
  readonly value: string
  readonly subValue?: string | undefined
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
        "flex basis-[176px] min-w-[176px] shrink-0 cursor-pointer flex-col gap-1 rounded-md p-2 text-left",
        "transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isSelected && "bg-muted",
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
      {/* Reserved even when empty so cards with and without a sub-value stay the same height. */}
      <Text.H6 color="foregroundMuted" ellipsis>
        {isLoading || !subValue ? "\u00a0" : subValue}
      </Text.H6>
    </button>
  )
}

const DASH = "—"

export function GeneralAggregations({
  projectId,
  filters,
  mode,
  selectedMetric,
  onMetricSelect,
  onCollapse,
}: {
  readonly projectId: string
  readonly filters: FilterSet
  readonly mode: AggregationsMode
  readonly selectedMetric: TraceHistogramMetric
  readonly onMetricSelect: (metric: TraceHistogramMetric) => void
  readonly onCollapse: () => void
}) {
  const isSessionsMode = mode === "sessions"
  const hasActiveFilters = Object.keys(filters).length > 0
  const filterOpts = hasActiveFilters ? { filters } : {}
  const traceModeProjectId = isSessionsMode ? "" : projectId
  const sessionModeProjectId = isSessionsMode ? projectId : ""

  const { data: traceMetrics, isLoading: traceMetricsLoading } = useTraceMetrics({
    projectId: traceModeProjectId,
    ...filterOpts,
  })
  const { totalCount: traceTotalCount, isLoading: traceCountLoading } = useTracesCount({
    projectId: traceModeProjectId,
    ...filterOpts,
  })
  const { totalCount: sessionTotalCount, isLoading: sessionCountLoading } = useSessionsCount({
    projectId: sessionModeProjectId,
    ...filterOpts,
  })
  const { data: sessionMetrics, isLoading: sessionMetricsLoading } = useSessionMetrics({
    projectId: sessionModeProjectId,
    ...filterOpts,
  })

  const activeMetrics: TraceMetrics | SessionMetrics | undefined = isSessionsMode
    ? (sessionMetrics ?? undefined)
    : (traceMetrics ?? undefined)
  // Session-mode trace count is `sum(trace_count)` over matched sessions, not the project-wide count.
  const traceCount = isSessionsMode ? (sessionMetrics?.traceCount ?? 0) : traceTotalCount
  const traceCardLoading = isSessionsMode ? sessionMetricsLoading : traceCountLoading
  const metricsCardLoading = isSessionsMode ? sessionMetricsLoading : traceMetricsLoading

  // Each metric declares its own visibility via `isAvailable` (e.g. cache hit
  // rate hides itself when there are no input-side tokens). The Boolean filter
  // defends the panel against a metric id with no definition.
  const visibleMetrics = metricOrderForMode(mode)
    .map((id) => HISTOGRAM_METRIC_DEFINITIONS[id])
    .filter((def): def is HistogramMetricDefinition => Boolean(def))
    .filter((def) => def.isAvailable?.(activeMetrics) ?? true)

  const [showLeftFade, setShowLeftFade] = useState(false)

  const renderValue = (def: HistogramMetricDefinition): string => {
    if (def.id === "sessions") return def.formatBucket(sessionTotalCount)
    if (def.id === "traces") return def.formatBucket(traceCount)
    if (!activeMetrics) return DASH
    return def.formatBucket(def.selectMetricsValue(activeMetrics, traceCount))
  }

  const unitNoun = unitNounForMode(mode)

  const renderSubValue = (def: HistogramMetricDefinition): string | undefined => {
    if (!activeMetrics || !def.selectUnitAverage) return undefined
    return `avg ${def.formatBucket(def.selectUnitAverage(activeMetrics))}/${unitNoun}`
  }

  const loadingForCard = (id: TraceHistogramMetric): boolean => {
    if (id === "sessions") return sessionCountLoading
    if (id === "traces") return traceCardLoading
    return metricsCardLoading
  }

  return (
    <div className="flex items-start gap-1 pr-2">
      <div className="relative min-w-0 flex-1">
        <div
          className="flex flex-row gap-1 overflow-x-auto p-2"
          onScroll={(e) => setShowLeftFade(e.currentTarget.scrollLeft > 0)}
        >
          {visibleMetrics.map((def) => (
            <AggregationItem
              key={def.id}
              label={def.label}
              value={renderValue(def)}
              subValue={renderSubValue(def)}
              isLoading={loadingForCard(def.id)}
              isSelected={selectedMetric === def.id}
              skeletonWidthClassName={def.cardSkeletonWidthClassName}
              onClick={() => onMetricSelect(def.id)}
            />
          ))}
        </div>
        {showLeftFade && (
          <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-secondary to-transparent" />
        )}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-secondary to-transparent" />
      </div>
      <Button variant="ghost" size="icon" onClick={onCollapse} aria-label="Collapse statistics" className="shrink-0">
        <Icon icon={ChevronUp} size="sm" />
      </Button>
    </div>
  )
}
