import type { FilterSet } from "@domain/shared"
import {
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableSorting,
  ProviderIcon,
  TagList,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatDuration, formatPrice, relativeTime } from "@repo/utils"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { type RefObject, useCallback, useMemo, useState } from "react"
import { useTraceMetrics, useTracesInfiniteScroll } from "../../../../../domains/traces/traces.collection.ts"
import type { TraceRecord } from "../../../../../domains/traces/traces.functions.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { type SelectionState, useSelectableRows } from "../../../../../lib/hooks/useSelectableRows.ts"
import { FiltersSidebar } from "./filters-sidebar.tsx"
import { TableMetricSubheader } from "./table/metric-subheader.tsx"

const DEFAULT_SORTING: InfiniteTableSorting = { column: "startTime", direction: "desc" }

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

interface TracesViewProps {
  readonly projectId: string
  readonly filters: FilterSet
  readonly filtersOpen: boolean
  readonly activeTraceId: string | undefined
  readonly activeDrawerTab: string
  readonly selectionState: SelectionState<string>
  readonly onSelectionChange: (state: SelectionState<string>) => void
  readonly totalTraceCount: number
  readonly onFiltersChange: (filters: FilterSet) => void
  readonly onFiltersClose: () => void
  readonly onActiveTraceChange: (traceId: string | undefined) => void
  readonly traceIdsRef: RefObject<string[]>
  readonly visibleColumnIds: readonly TraceColumnId[]
}

export function TracesView({
  projectId,
  filters,
  filtersOpen,
  activeTraceId,
  activeDrawerTab,
  selectionState,
  onSelectionChange,
  totalTraceCount,
  onFiltersChange,
  onFiltersClose,
  onActiveTraceChange,
  traceIdsRef,
  visibleColumnIds,
}: TracesViewProps) {
  const [sorting, setSorting] = useState<InfiniteTableSorting>(DEFAULT_SORTING)

  const hasActiveFilters = Object.keys(filters).length > 0

  const {
    data: traces,
    isLoading,
    infiniteScroll,
  } = useTracesInfiniteScroll({
    projectId,
    sorting,
    ...(hasActiveFilters ? { filters } : {}),
  })

  const { data: traceMetrics, isLoading: metricsLoading } = useTraceMetrics({
    projectId,
    ...(hasActiveFilters ? { filters } : {}),
  })

  const allColumns = useMemo((): InfiniteTableColumn<TraceRecord>[] => {
    return [
      {
        key: "startTime",
        header: "Start Time",
        sortKey: "startTime",
        width: 180,
        render: (t) => (
          <Tooltip asChild trigger={<span>{relativeTime(new Date(t.startTime))}</span>}>
            {new Date(t.startTime).toLocaleString()}
          </Tooltip>
        ),
      },
      {
        key: "name",
        header: "Name",
        width: 180,
        render: (t) => t.rootSpanName || t.traceId.slice(0, 8),
      },
      {
        key: "tags",
        header: "Tags",
        width: 150,
        render: (t) => <TagList tags={t.tags} />,
      },
      {
        key: "duration",
        header: "Duration",
        align: "end",
        sortKey: "duration",
        width: 120,
        render: (t) => formatDuration(t.durationNs),
        renderSubheader: () => (
          <TableMetricSubheader rollup={traceMetrics?.durationNs} format="duration" isLoading={metricsLoading} />
        ),
      },
      {
        key: "ttft",
        header: "Time To First Token",
        align: "end",
        sortKey: "ttft",
        width: 162,
        render: (t) => (t.timeToFirstTokenNs > 0 ? formatDuration(t.timeToFirstTokenNs) : "-"),
        renderSubheader: () => (
          <TableMetricSubheader
            rollup={
              traceMetrics && traceMetrics.timeToFirstTokenNs.max > 0 ? traceMetrics.timeToFirstTokenNs : undefined
            }
            format="duration"
            isLoading={metricsLoading}
          />
        ),
      },
      {
        key: "cost",
        header: "Cost",
        align: "end",
        sortKey: "cost",
        width: 130,
        render: (t) => formatPrice(t.costTotalMicrocents / 100_000_000),
        renderSubheader: () => (
          <TableMetricSubheader rollup={traceMetrics?.costTotalMicrocents} format="price" isLoading={metricsLoading} />
        ),
      },
      {
        key: "sessionId",
        header: "Session ID",
        width: 160,
        render: (t) => t.sessionId,
      },
      {
        key: "userId",
        header: "User ID",
        width: 160,
        render: (t) => t.userId,
      },
      {
        key: "models",
        header: "Models",
        width: 160,
        render: (t) => (
          <div className="flex items-center gap-1.5">
            {t.providers.map((p) => (
              <Tooltip
                asChild
                key={p}
                trigger={
                  <span>
                    <ProviderIcon provider={p} size="sm" />
                  </span>
                }
              >
                {p}
              </Tooltip>
            ))}
            <span className="truncate">{t.models.join(", ")}</span>
          </div>
        ),
      },
      {
        key: "spans",
        header: "Spans",
        align: "end",
        sortKey: "spans",
        width: 110,
        render: (t) => (
          <>
            {formatCount(t.spanCount)}
            {t.errorCount > 0 && <span className="text-destructive"> ({t.errorCount} err)</span>}
          </>
        ),
        renderSubheader: () => (
          <TableMetricSubheader rollup={traceMetrics?.spanCount} format="count" isLoading={metricsLoading} />
        ),
      },
    ]
  }, [traceMetrics, metricsLoading])

  const columns = useMemo(
    () => allColumns.filter((column) => visibleColumnIds.includes(column.key as TraceColumnId)),
    [allColumns, visibleColumnIds],
  )

  const traceIds = useMemo(() => traces.map((t) => t.traceId), [traces])

  // Write trace IDs into the shared ref during render so the parent can navigate next/prev without a callback effect
  traceIdsRef.current = traceIds
  const selection = useSelectableRows({
    rowIds: traceIds,
    totalRowCount: totalTraceCount,
    controlledState: selectionState,
    onStateChange: onSelectionChange,
  })

  const onRowClick = (t: TraceRecord) => {
    const sel = window.getSelection()
    if (sel && sel.toString().length > 0) return
    onActiveTraceChange(t.traceId === activeTraceId ? undefined : t.traceId)
  }

  const getRowAriaLabel = useCallback(
    (t: TraceRecord) => {
      const short = t.rootSpanName || t.traceId.slice(0, 8)
      return t.traceId === activeTraceId ? `Deselect trace ${short}` : `View trace ${short}`
    },
    [activeTraceId],
  )

  // J/K hotkeys: navigate through traces. Disabled when spans tab is active (span tree takes over J/K).
  const jkEnabled = activeDrawerTab !== "spans"
  useHotkeys([
    {
      hotkey: "J",
      callback: () => {
        const idx = activeTraceId ? traceIds.indexOf(activeTraceId) : -1
        const next = traceIds[idx + 1]
        if (next) onActiveTraceChange(next)
        else if (traceIds.length > 0 && !activeTraceId) onActiveTraceChange(traceIds[0])
      },
      options: { enabled: jkEnabled },
    },
    {
      hotkey: "K",
      callback: () => {
        const idx = activeTraceId ? traceIds.indexOf(activeTraceId) : traceIds.length
        const prev = traceIds[idx - 1]
        if (prev) onActiveTraceChange(prev)
      },
      options: { enabled: jkEnabled },
    },
  ])

  return (
    <Layout.Body>
      {filtersOpen && (
        <FiltersSidebar
          mode="traces"
          projectId={projectId}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onClose={onFiltersClose}
        />
      )}
      <Layout.List>
        <InfiniteTable
          data={traces}
          isLoading={isLoading}
          columns={columns}
          getRowKey={(t: TraceRecord) => t.traceId}
          onRowClick={onRowClick}
          getRowAriaLabel={getRowAriaLabel}
          {...(activeTraceId ? { activeRowKey: activeTraceId } : {})}
          selection={selection}
          infiniteScroll={infiniteScroll}
          sorting={sorting}
          defaultSorting={DEFAULT_SORTING}
          onSortChange={setSorting}
          blankSlate={hasActiveFilters ? "No traces match the current filters" : "No traces found"}
        />
      </Layout.List>
    </Layout.Body>
  )
}
