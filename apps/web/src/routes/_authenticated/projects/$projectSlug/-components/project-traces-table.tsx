import type { TraceMetrics } from "@domain/spans"
import {
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableInfiniteScroll,
  type InfiniteTableSelection,
  type InfiniteTableSorting,
  ProviderIcon,
  Status,
  TagList,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatDuration, formatPrice, relativeTime } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { type ReactNode, useCallback, useMemo } from "react"
import type { TraceRecord } from "../../../../../domains/traces/traces.functions.ts"
import { TableMetricSubheader } from "./table/metric-subheader.tsx"
import { TraceOutlierBadge } from "./trace-outlier-badge.tsx"

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

interface ProjectTracesTableProps {
  readonly projectId: string
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
  /** When provided, renders the name column as a real link for accessibility (e.g., open in new tab). */
  readonly getTraceHref?: (trace: TraceRecord) => string
  /** Target for the name-column link. Defaults to same-tab; use "_blank" to open in a new tab. */
  readonly linkTarget?: "_self" | "_blank"
  readonly traceMetrics?: TraceMetrics | null | undefined
  readonly metricsLoading?: boolean | undefined
  readonly scrollAreaLayout?: "fill" | "intrinsic"
  readonly scrollContainerClassName?: string
}

export function ProjectTracesTable({
  projectId,
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
  getTraceHref,
  linkTarget,
  traceMetrics,
  metricsLoading,
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
        width: 210,
        render: (trace) => (
          <span className="flex items-center justify-start gap-x-1.5">
            <Tooltip asChild trigger={<span className="truncate">{relativeTime(new Date(trace.startTime))}</span>}>
              {new Date(trace.startTime).toLocaleString()}
            </Tooltip>
            {trace.errorCount > 0 && (
              <Tooltip
                asChild
                trigger={
                  <Status
                    variant="destructive"
                    indicator={false}
                    label={formatCount(trace.errorCount)}
                    className="!rounded-md"
                  />
                }
              >
                {trace.errorCount} {trace.errorCount === 1 ? "error" : "errors"} in this trace
              </Tooltip>
            )}
          </span>
        ),
      },
      {
        key: "name",
        header: "Name",
        width: 180,
        render: (trace) => {
          const displayName = trace.rootSpanName || trace.traceId.slice(0, 8)
          if (getTraceHref) {
            return (
              <Link
                to={getTraceHref(trace)}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                className="hover:underline"
                {...(linkTarget === "_blank" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {displayName}
              </Link>
            )
          }
          return displayName
        },
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
        render: (trace) => (
          <span className="flex items-center justify-end gap-1">
            <TraceOutlierBadge projectId={projectId} tags={trace.tags} value={trace.durationNs} metric="durationNs" />
            {trace.durationNs > 0 ? formatDuration(trace.durationNs) : "-"}
          </span>
        ),
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
        render: (trace) => (
          <span className="flex items-center justify-end gap-1">
            <TraceOutlierBadge
              projectId={projectId}
              tags={trace.tags}
              value={trace.timeToFirstTokenNs}
              metric="timeToFirstTokenNs"
            />
            {trace.timeToFirstTokenNs > 0 ? formatDuration(trace.timeToFirstTokenNs) : "-"}
          </span>
        ),
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
        render: (trace) => (
          <span className="flex items-center justify-end gap-1">
            <TraceOutlierBadge
              projectId={projectId}
              tags={trace.tags}
              value={trace.costTotalMicrocents}
              metric="costTotalMicrocents"
            />
            {trace.costTotalMicrocents > 0 ? formatPrice(trace.costTotalMicrocents / 100_000_000) : "-"}
          </span>
        ),
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
  }, [showMetricSubheaders, traceMetrics, metricsLoading, projectId, getTraceHref, linkTarget])

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
