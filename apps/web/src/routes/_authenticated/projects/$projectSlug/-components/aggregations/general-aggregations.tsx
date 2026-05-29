import type { FilterSet } from "@domain/shared"
import type { SessionMetrics, TraceHistogramMetric, TraceMetrics } from "@domain/spans"
import { Button, cn, Icon, Skeleton, Text } from "@repo/ui"
import { ChevronUp } from "lucide-react"
import { useState } from "react"
import { useSessionMetrics, useSessionsCount } from "../../../../../../domains/sessions/sessions.collection.ts"
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

const METRIC_ORDER: readonly TraceHistogramMetric[] = [
  "sessions",
  "cost",
  "duration",
  "tokens",
  "ttft",
  "traces",
  "spans",
]

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
  readonly mode: "traces" | "sessions"
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
    projectId,
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

  // TTFT card is hidden when no row in the current view recorded a first-token timestamp
  // (`> 0`); showing it would just render "—" forever for projects that don't stream.
  const showTtft = !!activeMetrics && activeMetrics.timeToFirstTokenNs.max > 0

  const visibleMetrics = METRIC_ORDER.filter((id) => id !== "ttft" || showTtft).map(
    (id) => HISTOGRAM_METRIC_DEFINITIONS[id],
  )

  const [showLeftFade, setShowLeftFade] = useState(false)

  const renderValue = (def: HistogramMetricDefinition): string => {
    if (def.id === "sessions") return def.formatBucket(sessionTotalCount)
    if (def.id === "traces") return def.formatBucket(traceCount)
    if (!activeMetrics) return DASH
    return def.formatBucket(def.selectMetricsValue(activeMetrics, traceCount))
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
