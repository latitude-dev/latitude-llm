import type { FilterSet } from "@domain/shared"
import {
  type CheckedState,
  type ExpandedRows,
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableSelection,
  type InfiniteTableSorting,
  ProviderIcon,
  TagList,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatDuration, formatPrice, relativeTime } from "@repo/utils"
import { useQueries } from "@tanstack/react-query"
import { type RefObject, useCallback, useMemo, useState } from "react"
import { useSessionMetrics, useSessionsInfiniteScroll } from "../../../../../domains/sessions/sessions.collection.ts"
import type { SessionRecord } from "../../../../../domains/sessions/sessions.functions.ts"
import { listTracesByProject, type TraceRecord } from "../../../../../domains/traces/traces.functions.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { type SelectionState, useSelectableRows } from "../../../../../lib/hooks/useSelectableRows.ts"
import { FiltersSidebar } from "./filters-sidebar.tsx"
import { TableMetricSubheader } from "./table/metric-subheader.tsx"

type SessionTableRow =
  | { readonly kind: "session"; readonly session: SessionRecord }
  | { readonly kind: "trace"; readonly trace: TraceRecord }

function field<K extends keyof SessionRecord & keyof TraceRecord>(row: SessionTableRow, key: K) {
  return row.kind === "session" ? row.session[key] : row.trace[key]
}

const EMPTY_CELL = <Text.H5 color="foregroundMuted">-</Text.H5>

const DEFAULT_SORTING: InfiniteTableSorting = { column: "startTime", direction: "desc" }

const SESSION_TRACES_LIMIT = 25

function useExpandedSessionTraces(
  projectId: string,
  expandedIds: ReadonlySet<string>,
  sessions: readonly SessionRecord[],
  sorting: InfiniteTableSorting,
) {
  const expandedSessionIds = useMemo(
    () => sessions.filter((s) => expandedIds.has(s.sessionId)).map((s) => s.sessionId),
    [sessions, expandedIds],
  )

  const results = useQueries({
    queries: expandedSessionIds.map((sessionId) => ({
      queryKey: ["session-traces", projectId, sessionId, sorting.column, sorting.direction],
      queryFn: async () => {
        const result = await listTracesByProject({
          data: {
            projectId,
            limit: SESSION_TRACES_LIMIT,
            sortBy: sorting.column,
            sortDirection: sorting.direction,
            filters: { sessionId: [{ op: "eq", value: sessionId }] },
          },
        })
        return { sessionId, traces: result?.traces ?? [] }
      },
      staleTime: 30_000,
    })),
  })

  return useMemo(() => {
    const traceMap = new Map<string, { data: readonly TraceRecord[]; isLoading: boolean }>()
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      const sessionId = expandedSessionIds[i]
      if (!r || !sessionId) continue
      if (r.data) {
        traceMap.set(r.data.sessionId, { data: r.data.traces, isLoading: r.isLoading })
      } else {
        traceMap.set(sessionId, { data: [], isLoading: r.isLoading })
      }
    }
    return traceMap
  }, [results, expandedSessionIds])
}

function useSessionSelectionAdapter({
  selectionState,
  onSelectionChange,
  sessions,
  totalTraceCount,
}: {
  selectionState: SelectionState<string>
  onSelectionChange: (state: SelectionState<string>) => void
  sessions: readonly SessionRecord[]
  totalTraceCount: number
}): InfiniteTableSelection {
  const sessionTraceIndex = useMemo(() => {
    const index = new Map<string, readonly string[]>()
    for (const s of sessions) index.set(s.sessionId, s.traceIds)
    return index
  }, [sessions])

  const allVisibleTraceIds = useMemo(() => {
    const ids: string[] = []
    for (const traceIds of sessionTraceIndex.values()) {
      for (const id of traceIds) ids.push(id)
    }
    return ids
  }, [sessionTraceIndex])

  const traceSelection = useSelectableRows({
    rowIds: allVisibleTraceIds,
    totalRowCount: totalTraceCount,
    controlledState: selectionState,
    onStateChange: onSelectionChange,
  })

  const getSessionCheckedState = useCallback(
    (sessionId: string): CheckedState => {
      const traceIds = sessionTraceIndex.get(sessionId)
      if (!traceIds || traceIds.length === 0) return false
      const selectedCount = traceIds.filter((id) => traceSelection.isSelected(id)).length
      if (selectedCount === 0) return false
      if (selectedCount === traceIds.length) return true
      return "indeterminate"
    },
    [sessionTraceIndex, traceSelection],
  )

  const toggleSessionTraces = useCallback(
    (sessionId: string, checked: CheckedState) => {
      const traceIds = sessionTraceIndex.get(sessionId)
      if (!traceIds || traceIds.length === 0) return
      if (checked) {
        traceSelection.selectMany(traceIds as string[])
      } else {
        traceSelection.deselectMany(traceIds as string[])
      }
    },
    [sessionTraceIndex, traceSelection],
  )

  return useMemo(
    (): InfiniteTableSelection => ({
      headerState: traceSelection.headerState,
      isSelected: (key) => traceSelection.isSelected(key),
      getCheckedState: (key) => {
        if (sessionTraceIndex.has(key)) return getSessionCheckedState(key)
        return traceSelection.isSelected(key)
      },
      toggleRow: (key, checked, options) => {
        if (sessionTraceIndex.has(key)) {
          toggleSessionTraces(key, checked)
          return
        }
        traceSelection.toggleRow(key, checked, options)
      },
      toggleAll: () => traceSelection.toggleAll(),
    }),
    [traceSelection, sessionTraceIndex, getSessionCheckedState, toggleSessionTraces],
  )
}

interface SessionsViewProps {
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
  readonly onActiveSessionChange?: (sessionId: string | undefined) => void
  readonly traceIdsRef: RefObject<string[]>
}

export function SessionsView({
  projectId,
  filters,
  filtersOpen,
  activeTraceId,
  selectionState,
  onSelectionChange,
  totalTraceCount,
  onFiltersChange,
  onFiltersClose,
  onActiveTraceChange,
  onActiveSessionChange,
  traceIdsRef,
}: SessionsViewProps) {
  const [sorting, setSorting] = useState<InfiniteTableSorting>(DEFAULT_SORTING)
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set())

  const hasActiveFilters = Object.keys(filters).length > 0

  const {
    data: sessions,
    isLoading,
    infiniteScroll,
  } = useSessionsInfiniteScroll({
    projectId,
    sorting,
    ...(hasActiveFilters ? { filters } : {}),
  })

  const { data: sessionMetrics, isLoading: sessionMetricsLoading } = useSessionMetrics({
    projectId,
    ...(hasActiveFilters ? { filters } : {}),
  })

  const columns = useMemo((): InfiniteTableColumn<SessionTableRow>[] => {
    return [
      {
        key: "startTime",
        header: "Start Time",
        sortKey: "startTime",
        render: (row) => {
          const time = field(row, "startTime")
          return (
            <Tooltip asChild trigger={<span>{relativeTime(new Date(time))}</span>}>
              {new Date(time).toLocaleString()}
            </Tooltip>
          )
        },
      },
      {
        key: "name",
        header: "Name",
        render: (row) => {
          if (row.kind === "session") return EMPTY_CELL
          return row.trace.rootSpanName || row.trace.traceId.slice(0, 8)
        },
      },
      {
        key: "tags",
        header: "Tags",
        render: (row) => <TagList tags={field(row, "tags")} />,
      },
      {
        key: "duration",
        header: "Duration",
        align: "end",
        render: (row) => {
          if (row.kind === "session") return EMPTY_CELL
          return formatDuration(row.trace.durationNs)
        },
        renderSubheader: () => (
          <TableMetricSubheader
            rollup={sessionMetrics?.durationNs}
            format="duration"
            isLoading={sessionMetricsLoading}
          />
        ),
      },
      {
        key: "ttft",
        header: "Time To First Token",
        align: "end",
        render: (row) => {
          if (row.kind === "session") return EMPTY_CELL
          return row.trace.timeToFirstTokenNs > 0 ? formatDuration(row.trace.timeToFirstTokenNs) : "-"
        },
      },
      {
        key: "cost",
        header: "Cost",
        align: "end",
        sortKey: "cost",
        render: (row) => formatPrice(field(row, "costTotalMicrocents") / 100_000_000),
        renderSubheader: () => (
          <TableMetricSubheader
            rollup={sessionMetrics?.costTotalMicrocents}
            format="price"
            isLoading={sessionMetricsLoading}
          />
        ),
      },
      {
        key: "sessionId",
        header: "Session ID",
        render: (row) => {
          if (row.kind === "session") {
            if (onActiveSessionChange) {
              return (
                <button
                  type="button"
                  className="max-w-full cursor-pointer truncate text-left font-inherit text-primary hover:underline"
                  onClick={(e) => {
                    e.stopPropagation()
                    onActiveSessionChange(row.session.sessionId)
                  }}
                >
                  {row.session.sessionId}
                </button>
              )
            }
            return row.session.sessionId
          }
          return row.trace.sessionId
        },
      },
      {
        key: "userId",
        header: "User ID",
        render: (row) => field(row, "userId"),
      },
      {
        key: "models",
        header: "Models",
        render: (row) => {
          const providers = field(row, "providers")
          const models = field(row, "models")
          return (
            <div className="flex items-center gap-1.5">
              {providers.map((p) => (
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
              <span className="truncate">{models.join(", ")}</span>
            </div>
          )
        },
      },
      {
        key: "spans",
        header: "Spans",
        align: "end",
        sortKey: "spans",
        render: (row) => {
          const spanCount = field(row, "spanCount")
          const errorCount = field(row, "errorCount")
          return (
            <>
              {formatCount(spanCount)}
              {errorCount > 0 && <span className="text-destructive"> ({errorCount} err)</span>}
            </>
          )
        },
        renderSubheader: () => (
          <TableMetricSubheader rollup={sessionMetrics?.spanCount} format="count" isLoading={sessionMetricsLoading} />
        ),
      },
    ]
  }, [sessionMetrics, sessionMetricsLoading, onActiveSessionChange])

  const traceMap = useExpandedSessionTraces(projectId, expandedIds, sessions, sorting)

  const selection = useSessionSelectionAdapter({
    selectionState,
    onSelectionChange,
    sessions,
    totalTraceCount,
  })

  const tableData: readonly SessionTableRow[] = sessions.map(
    (session): SessionTableRow => ({ kind: "session", session }),
  )
  traceIdsRef.current = []

  const getRowKey = (row: SessionTableRow) => (row.kind === "session" ? row.session.sessionId : row.trace.traceId)

  const onRowClick = (row: SessionTableRow) => {
    if (row.kind === "session") {
      setExpandedIds((prev) => {
        const next = new Set(prev)
        if (next.has(row.session.sessionId)) {
          next.delete(row.session.sessionId)
        } else {
          next.add(row.session.sessionId)
        }
        return next
      })
    } else {
      const sel = window.getSelection()
      if (sel && sel.toString().length > 0) return
      onActiveTraceChange(row.trace.traceId === activeTraceId ? undefined : row.trace.traceId)
    }
  }

  const getExpandedRows = (row: SessionTableRow): ExpandedRows<SessionTableRow> => {
    if (row.kind !== "session") return { data: [] }
    const entry = traceMap.get(row.session.sessionId)
    if (!entry) return { data: [], isLoading: true }
    return {
      data: entry.data.map((trace): SessionTableRow => ({ kind: "trace", trace })),
      isLoading: entry.isLoading,
    }
  }

  return (
    <Layout.Body>
      {filtersOpen && (
        <FiltersSidebar
          mode="sessions"
          projectId={projectId}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onClose={onFiltersClose}
        />
      )}
      <Layout.List>
        <InfiniteTable
          data={tableData}
          isLoading={isLoading}
          columns={columns}
          getRowKey={getRowKey}
          onRowClick={onRowClick}
          {...(activeTraceId ? { activeRowKey: activeTraceId } : {})}
          selection={selection}
          infiniteScroll={infiniteScroll}
          sorting={sorting}
          defaultSorting={DEFAULT_SORTING}
          onSortChange={setSorting}
          blankSlate={hasActiveFilters ? "No sessions match the current filters" : "No sessions found"}
          expandedRowKeys={expandedIds}
          getExpandedRows={getExpandedRows}
        />
      </Layout.List>
    </Layout.Body>
  )
}
