import { getTraceMetricPercentileThreshold, type TraceCohortSummary, type TraceMetrics } from "@domain/spans"
import {
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableInfiniteScroll,
  type InfiniteTableSelection,
  type InfiniteTableSorting,
  ProviderIcon,
  Status,
  type StatusProps,
  TagList,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatDuration, formatPrice, relativeTime } from "@repo/utils"
import { type ReactNode, useCallback, useMemo } from "react"
import type { TraceRecord } from "../../../../../domains/traces/traces.functions.ts"
import { TableMetricSubheader } from "./table/metric-subheader.tsx"

export const DEFAULT_TRACE_TABLE_SORTING: InfiniteTableSorting = { column: "startTime", direction: "desc" }

export const TRACE_COLUMN_OPTIONS = [
  { id: "startTime", label: "Start Time", required: true },
  { id: "name", label: "Name" },
  { id: "tags", label: "Tags" },
  { id: "duration", label: "Duration" },
  { id: "ttft", label: "Time To First Token" },
  { id: "cost", label: "Cost" },
  { id: "sessionId", label: "Session ID" },
  { id: "userId", label: "User ID" },
  { id: "models", label: "Models" },
  { id: "spans", label: "Spans" },
] as const

export type TraceColumnId = (typeof TRACE_COLUMN_OPTIONS)[number]["id"]
type Baselines = TraceCohortSummary["baselines"]

function getPercentileLevel(
  value: number,
  baseline: Baselines[keyof Baselines] | undefined,
): "p99" | "p95" | "p90" | undefined {
  if (!baseline) return undefined

  const p99 = getTraceMetricPercentileThreshold(baseline, "p99")
  if (p99 !== null && value >= p99) return "p99"

  const p95 = getTraceMetricPercentileThreshold(baseline, "p95")
  if (p95 !== null && value >= p95) return "p95"

  const p90 = getTraceMetricPercentileThreshold(baseline, "p90")
  if (p90 !== null && value >= p90) return "p90"

  return undefined
}

function getPercentileStatusVariant(level: "p99" | "p95" | "p90"): NonNullable<StatusProps["variant"]> {
  switch (level) {
    case "p99":
      return "destructive"
    case "p95":
      return "warning"
    case "p90":
      return "info"
  }
}

interface ProjectTracesTableProps {
  readonly data: readonly TraceRecord[]
  readonly isLoading?: boolean | undefined
  readonly visibleColumnIds: readonly TraceColumnId[]
  readonly blankSlate?: ReactNode | string
  readonly infiniteScroll?: InfiniteTableInfiniteScroll
  readonly activeTraceId?: string | undefined
  readonly activeRowAutoScroll?: boolean | undefined
  readonly selection?: InfiniteTableSelection
  readonly sorting?: InfiniteTableSorting
  readonly defaultSorting?: InfiniteTableSorting
  readonly onSortChange?: (sorting: InfiniteTableSorting) => void
  readonly onTraceClick?: (trace: TraceRecord) => void
  readonly getTraceRowAriaLabel?: (trace: TraceRecord) => string
  readonly rowInteractionRole?: "button" | "link"
  readonly traceMetrics?: TraceMetrics | null | undefined
  readonly metricsLoading?: boolean | undefined
  readonly baselines?: Baselines | undefined
  readonly scrollAreaLayout?: "fill" | "intrinsic"
  readonly scrollContainerClassName?: string
}

export function ProjectTracesTable({
  data,
  isLoading,
  visibleColumnIds,
  blankSlate,
  infiniteScroll,
  activeTraceId,
  activeRowAutoScroll,
  selection,
  sorting,
  defaultSorting,
  onSortChange,
  onTraceClick,
  getTraceRowAriaLabel,
  rowInteractionRole,
  traceMetrics,
  metricsLoading,
  baselines,
  scrollAreaLayout,
  scrollContainerClassName,
}: ProjectTracesTableProps) {
  const showMetricSubheaders = traceMetrics !== undefined || metricsLoading !== undefined

  const allColumns = useMemo((): InfiniteTableColumn<TraceRecord>[] => {
    return [
      {
        key: "startTime",
        header: "Start Time",
        sortKey: "startTime",
        width: 180,
        render: (trace) => (
          <Tooltip asChild trigger={<span>{relativeTime(new Date(trace.startTime))}</span>}>
            {new Date(trace.startTime).toLocaleString()}
          </Tooltip>
        ),
      },
      {
        key: "name",
        header: "Name",
        width: 180,
        render: (trace) => trace.rootSpanName || trace.traceId.slice(0, 8),
      },
      {
        key: "tags",
        header: "Tags",
        width: 150,
        render: (trace) => <TagList tags={trace.tags} />,
      },
      {
        key: "duration",
        header: "Duration",
        align: "end",
        sortKey: "duration",
        width: 140,
        render: (trace) => {
          const hasDuration = trace.durationNs > 0
          const level = hasDuration ? getPercentileLevel(trace.durationNs, baselines?.durationNs) : undefined
          return (
            <span className="flex items-center justify-end gap-1">
              {level ? <Status variant={getPercentileStatusVariant(level)} label={level} /> : null}
              {hasDuration ? formatDuration(trace.durationNs) : "-"}
            </span>
          )
        },
        ...(showMetricSubheaders
          ? {
              renderSubheader: () => (
                <TableMetricSubheader
                  rollup={traceMetrics?.durationNs}
                  format="duration"
                  {...(metricsLoading !== undefined ? { isLoading: metricsLoading } : {})}
                />
              ),
            }
          : {}),
      },
      {
        key: "ttft",
        header: "Time To First Token",
        align: "end",
        sortKey: "ttft",
        width: 176,
        render: (trace) => {
          const level =
            trace.timeToFirstTokenNs > 0
              ? getPercentileLevel(trace.timeToFirstTokenNs, baselines?.timeToFirstTokenNs)
              : undefined
          return (
            <span className="flex items-center justify-end gap-1">
              {level ? <Status variant={getPercentileStatusVariant(level)} label={level} /> : null}
              {trace.timeToFirstTokenNs > 0 ? formatDuration(trace.timeToFirstTokenNs) : "-"}
            </span>
          )
        },
        ...(showMetricSubheaders
          ? {
              renderSubheader: () => (
                <TableMetricSubheader
                  rollup={
                    traceMetrics && traceMetrics.timeToFirstTokenNs.max > 0
                      ? traceMetrics.timeToFirstTokenNs
                      : undefined
                  }
                  format="duration"
                  {...(metricsLoading !== undefined ? { isLoading: metricsLoading } : {})}
                />
              ),
            }
          : {}),
      },
      {
        key: "cost",
        header: "Cost",
        align: "end",
        sortKey: "cost",
        width: 146,
        render: (trace) => {
          const hasCost = trace.costTotalMicrocents > 0
          const level = hasCost
            ? getPercentileLevel(trace.costTotalMicrocents, baselines?.costTotalMicrocents)
            : undefined
          return (
            <span className="flex items-center justify-end gap-1">
              {level ? <Status variant={getPercentileStatusVariant(level)} label={level} /> : null}
              {hasCost ? formatPrice(trace.costTotalMicrocents / 100_000_000) : "-"}
            </span>
          )
        },
        ...(showMetricSubheaders
          ? {
              renderSubheader: () => (
                <TableMetricSubheader
                  rollup={
                    traceMetrics && traceMetrics.costTotalMicrocents.max > 0
                      ? traceMetrics.costTotalMicrocents
                      : undefined
                  }
                  format="price"
                  {...(metricsLoading !== undefined ? { isLoading: metricsLoading } : {})}
                />
              ),
            }
          : {}),
      },
      {
        key: "sessionId",
        header: "Session ID",
        width: 160,
        render: (trace) => trace.sessionId,
      },
      {
        key: "userId",
        header: "User ID",
        width: 160,
        render: (trace) => trace.userId,
      },
      {
        key: "models",
        header: "Models",
        width: 160,
        render: (trace) => (
          <div className="flex items-center gap-1.5">
            {trace.providers.map((provider) => (
              <Tooltip
                asChild
                key={provider}
                trigger={
                  <span>
                    <ProviderIcon provider={provider} size="sm" />
                  </span>
                }
              >
                {provider}
              </Tooltip>
            ))}
            <span className="truncate">{trace.models.join(", ")}</span>
          </div>
        ),
      },
      {
        key: "spans",
        header: "Spans",
        align: "end",
        sortKey: "spans",
        width: 110,
        render: (trace) => (
          <>
            {formatCount(trace.spanCount)}
            {trace.errorCount > 0 ? <span className="text-destructive"> ({trace.errorCount} err)</span> : null}
          </>
        ),
        ...(showMetricSubheaders
          ? {
              renderSubheader: () => (
                <TableMetricSubheader
                  rollup={traceMetrics?.spanCount}
                  format="count"
                  {...(metricsLoading !== undefined ? { isLoading: metricsLoading } : {})}
                />
              ),
            }
          : {}),
      },
    ]
  }, [showMetricSubheaders, traceMetrics, metricsLoading, baselines])

  const columns = useMemo(
    () => allColumns.filter((column) => visibleColumnIds.includes(column.key as TraceColumnId)),
    [allColumns, visibleColumnIds],
  )

  const handleTraceClick = useCallback(
    (trace: TraceRecord) => {
      const selectionText = window.getSelection()?.toString()
      if (selectionText && selectionText.length > 0) {
        return
      }

      onTraceClick?.(trace)
    },
    [onTraceClick],
  )

  const defaultGetTraceRowAriaLabel = useCallback((trace: TraceRecord) => {
    const shortName = trace.rootSpanName || trace.traceId.slice(0, 8)
    return `View trace ${shortName}`
  }, [])

  return (
    <InfiniteTable
      data={data}
      {...(isLoading !== undefined ? { isLoading } : {})}
      {...(scrollAreaLayout !== undefined ? { scrollAreaLayout } : {})}
      {...(scrollContainerClassName !== undefined ? { className: scrollContainerClassName } : {})}
      columns={columns}
      getRowKey={(trace) => trace.traceId}
      {...(onTraceClick
        ? {
            onRowClick: handleTraceClick,
            getRowAriaLabel: getTraceRowAriaLabel ?? defaultGetTraceRowAriaLabel,
            ...(rowInteractionRole ? { rowInteractionRole } : {}),
          }
        : {})}
      {...(activeTraceId ? { activeRowKey: activeTraceId } : {})}
      {...(activeRowAutoScroll ? { activeRowAutoScroll } : {})}
      {...(selection ? { selection } : {})}
      {...(infiniteScroll ? { infiniteScroll } : {})}
      {...(sorting ? { sorting } : {})}
      {...(defaultSorting ? { defaultSorting } : {})}
      {...(onSortChange ? { onSortChange } : {})}
      {...(blankSlate !== undefined ? { blankSlate } : {})}
    />
  )
}
