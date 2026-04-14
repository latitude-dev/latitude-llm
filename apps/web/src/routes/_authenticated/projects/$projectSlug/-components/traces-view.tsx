import type { FilterSet } from "@domain/shared"
import type { TraceCohortSummary } from "@domain/spans"
import {
  Badge,
  type BadgeProps,
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableSorting,
  ProviderIcon,
  TagList,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatDuration, formatPrice, relativeTime } from "@repo/utils"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { type RefObject, useCallback, useMemo } from "react"
import { useTraceMetrics, useTracesInfiniteScroll } from "../../../../../domains/traces/traces.collection.ts"
import type { TraceRecord } from "../../../../../domains/traces/traces.functions.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { type SelectionState, useSelectableRows } from "../../../../../lib/hooks/useSelectableRows.ts"
import { FiltersSidebar } from "./filters-sidebar.tsx"
import { TableMetricSubheader } from "./table/metric-subheader.tsx"

const DEFAULT_SORTING: InfiniteTableSorting = { column: "startTime", direction: "desc" }

type Baselines = TraceCohortSummary["baselines"]

interface TracesViewProps {
  readonly projectId: string
  readonly filters: FilterSet
  readonly filtersOpen: boolean
  readonly activeTraceId: string | undefined
  readonly activeDrawerTab: string
  readonly baselines?: Baselines | undefined
  readonly sorting: InfiniteTableSorting
  readonly onSortingChange: (sorting: InfiniteTableSorting) => void
  readonly selectionState: SelectionState<string>
  readonly onSelectionChange: (state: SelectionState<string>) => void
  readonly totalTraceCount: number
  readonly onFiltersChange: (filters: FilterSet) => void
  readonly onFiltersClose: () => void
  readonly onActiveTraceChange: (traceId: string | undefined) => void
  readonly traceIdsRef: RefObject<string[]>
}

export function TracesView({
  projectId,
  filters,
  filtersOpen,
  activeTraceId,
  activeDrawerTab,
  baselines,
  sorting,
  onSortingChange,
  selectionState,
  onSelectionChange,
  totalTraceCount,
  onFiltersChange,
  onFiltersClose,
  onActiveTraceChange,
  traceIdsRef,
}: TracesViewProps) {
  const hasActiveFilters = Object.keys(filters).length > 0

  // Helper: get highest matching percentile level (p99 > p95 > p90)
  function getPercentileLevel(
    value: number,
    baseline: Baselines[keyof Baselines] | undefined,
  ): "p99" | "p95" | "p90" | undefined {
    if (!baseline || baseline.sampleCount === 0) return undefined
    if (baseline.p99 !== null && value >= baseline.p99) return "p99"
    if (baseline.p95 !== null && value >= baseline.p95) return "p95"
    if (value >= baseline.p90) return "p90"
    return undefined
  }

  // Helper: get badge variant for percentile level
  function getPercentileBadgeVariant(level: "p99" | "p95" | "p90"): BadgeProps["variant"] {
    switch (level) {
      case "p99":
        return "outlineDestructiveMuted"
      case "p95":
        return "outlineWarningMuted"
      case "p90":
        return "outlineAccent"
    }
  }

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

  const columns = useMemo((): InfiniteTableColumn<TraceRecord>[] => {
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
        width: 140,
        render: (t) => {
          const hasDuration = t.durationNs > 0
          const level = hasDuration ? getPercentileLevel(t.durationNs, baselines?.durationNs) : undefined
          return (
            <span className="flex items-center justify-end gap-1">
              {level && <Badge variant={getPercentileBadgeVariant(level)}>{level}</Badge>}
              {hasDuration ? formatDuration(t.durationNs) : "-"}
            </span>
          )
        },
        renderSubheader: () => (
          <TableMetricSubheader rollup={traceMetrics?.durationNs} format="duration" isLoading={metricsLoading} />
        ),
      },
      {
        key: "ttft",
        header: "Time To First Token",
        align: "end",
        sortKey: "ttft",
        width: 176,
        render: (t) => {
          const level =
            t.timeToFirstTokenNs > 0
              ? getPercentileLevel(t.timeToFirstTokenNs, baselines?.timeToFirstTokenNs)
              : undefined
          return (
            <span className="flex items-center justify-end gap-1">
              {level && <Badge variant={getPercentileBadgeVariant(level)}>{level}</Badge>}
              {t.timeToFirstTokenNs > 0 ? formatDuration(t.timeToFirstTokenNs) : "-"}
            </span>
          )
        },
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
        width: 146,
        render: (t) => {
          const hasCost = t.costTotalMicrocents > 0
          const level = hasCost ? getPercentileLevel(t.costTotalMicrocents, baselines?.costTotalMicrocents) : undefined
          return (
            <span className="flex items-center justify-end gap-1">
              {level && <Badge variant={getPercentileBadgeVariant(level)}>{level}</Badge>}
              {hasCost ? formatPrice(t.costTotalMicrocents / 100_000_000) : "-"}
            </span>
          )
        },
        renderSubheader: () => (
          <TableMetricSubheader
            rollup={
              traceMetrics && traceMetrics.costTotalMicrocents.max > 0 ? traceMetrics.costTotalMicrocents : undefined
            }
            format="price"
            isLoading={metricsLoading}
          />
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
  }, [baselines, metricsLoading, traceMetrics])

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
          onSortChange={onSortingChange}
          blankSlate={hasActiveFilters ? "No traces match the current filters" : "No traces found"}
        />
      </Layout.List>
    </Layout.Body>
  )
}
