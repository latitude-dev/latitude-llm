import type { FilterSet } from "@domain/shared"
import {
  type ExpandedRows,
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableSorting,
  ProviderIcon,
  TagList,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatDuration, formatPrice, relativeTime } from "@repo/utils"
import { useQueries } from "@tanstack/react-query"
import { ChevronsDownUpIcon, ChevronsUpDownIcon } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useAnnotationCountsByTraceIds } from "../../../../../domains/annotations/annotations.collection.ts"
import { useSessionMetrics, useSessionsInfiniteScroll } from "../../../../../domains/sessions/sessions.collection.ts"
import type { SessionRecord } from "../../../../../domains/sessions/sessions.functions.ts"
import type { TraceRecord } from "../../../../../domains/traces/traces.functions.ts"
import { ListingLayout as Layout, listingLayoutIntrinsicScroll } from "../../../../../layouts/ListingLayout/index.tsx"
import type { SelectionState } from "../../../../../lib/hooks/useSelectableRows.ts"
import { FiltersSidebar } from "./filters-sidebar.tsx"
import { sessionTracesQueryOptions } from "./session-detail-drawer/use-session-traces.ts"
import { SessionOutlierBadge } from "./session-outlier-badge.tsx"
import { IndicatorsCell } from "./table/indicators-cell.tsx"
import { TableMetricSubheader } from "./table/metric-subheader.tsx"
import { DEFAULT_SEARCH_SORTING, RELEVANCE_SORT_COLUMN } from "./trace-page-state.ts"
import { useSessionSelectionAdapter } from "./use-session-selection-adapter.ts"

type SessionTableRow =
  | { readonly kind: "session"; readonly session: SessionRecord }
  | { readonly kind: "trace"; readonly trace: TraceRecord }

function field<K extends keyof SessionRecord & keyof TraceRecord>(row: SessionTableRow, key: K) {
  return row.kind === "session" ? row.session[key] : row.trace[key]
}

const EMPTY_CELL = <Text.H5 color="foregroundMuted">-</Text.H5>

export const DEFAULT_SESSION_SORTING: InfiniteTableSorting = {
  column: "lastActivity",
  direction: "desc",
}

export const SESSION_COLUMN_OPTIONS = [
  { id: "indicators", label: "Indicators" },
  { id: "lastActivity", label: "Last Activity", required: true },
  { id: "name", label: "Name" },
  { id: "tags", label: "Tags" },
  { id: "searchMatches", label: "Matching traces" },
  { id: "duration", label: "Duration" },
  { id: "ttft", label: "Time To First Token", defaultHidden: true },
  { id: "cost", label: "Cost" },
  { id: "sessionId", label: "Session ID" },
  { id: "userId", label: "User ID" },
  { id: "models", label: "Models" },
  { id: "spans", label: "Spans" },
] as const

export type SessionColumnId = (typeof SESSION_COLUMN_OPTIONS)[number]["id"]

export function getSessionColumnOptions(isSearching: boolean): readonly (typeof SESSION_COLUMN_OPTIONS)[number][] {
  if (isSearching) return SESSION_COLUMN_OPTIONS
  return SESSION_COLUMN_OPTIONS.filter((column) => column.id !== "searchMatches")
}

function useExpandedSessionTraces(
  projectId: string,
  expandedIds: ReadonlySet<string>,
  sessions: readonly SessionRecord[],
) {
  const expandedSessionIds = useMemo(
    () => sessions.filter((s) => expandedIds.has(s.sessionId)).map((s) => s.sessionId),
    [sessions, expandedIds],
  )

  // Shared cache with the session panel's `useSessionTraces` — same key, same
  // query function, same limit. With the panel open on an expanded row the
  // ClickHouse query runs once and both surfaces read from it.
  const results = useQueries({
    queries: expandedSessionIds.map((sessionId) => sessionTracesQueryOptions(projectId, sessionId)),
  })

  return useMemo(() => {
    const traceMap = new Map<string, { data: readonly TraceRecord[]; isLoading: boolean }>()
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      const sessionId = expandedSessionIds[i]
      if (!r || !sessionId) continue
      const isLoading = r.isPending || (r.isFetching && r.data === undefined)
      traceMap.set(sessionId, { data: r.data ?? [], isLoading })
    }
    return traceMap
  }, [results, expandedSessionIds])
}

interface SessionsViewProps {
  readonly projectId: string
  readonly filters: FilterSet
  readonly filtersOpen: boolean
  /** Session whose detail panel is open — highlights its row. */
  readonly activeSessionId: string | undefined
  /** Trace currently shown in the panel's trace slot — highlights its sub-row. */
  readonly activeTraceId?: string | undefined
  readonly sorting: InfiniteTableSorting
  readonly onSortingChange: (sorting: InfiniteTableSorting) => void
  readonly selectionState: SelectionState<string>
  readonly onSelectionChange: (state: SelectionState<string>) => void
  readonly totalTraceCount: number
  readonly onFiltersChange: (filters: FilterSet) => void
  readonly onFiltersClose: () => void
  /**
   * Opens the session detail panel. A bare session-row click passes just the
   * session id (panel lands on Metadata); a trace reference passes the trace id
   * too (panel slides straight into that trace's slot).
   */
  readonly onOpenSession: (sessionId: string, traceId?: string) => void
  /** Closes the session detail panel (clicking the already-open session row). */
  readonly onCloseSession: () => void
  readonly visibleColumnIds: readonly SessionColumnId[]
  readonly isSearching: boolean
  /**
   * Free-text search query forwarded to `listSessionsByProject`. Optional —
   * the project page's Sessions tab (the original consumer) renders this view
   * without search, and the `/search` route passes the current query through.
   *
   * When non-empty, `useSessionsInfiniteScroll` returns the per-session
   * `searchMatches` payload (keyed by `sessionId`) alongside the sessions
   * page. We destructure it from the same hook call so the route doesn't
   * have to thread it as a prop — one source of truth, no risk of the route
   * forgetting to plumb a second piece of data.
   */
  readonly searchQuery?: string
}

export function SessionsView({
  projectId,
  filters,
  filtersOpen,
  activeSessionId,
  activeTraceId,
  sorting,
  onSortingChange,
  selectionState,
  onSelectionChange,
  totalTraceCount,
  onFiltersChange,
  onFiltersClose,
  onOpenSession,
  onCloseSession,
  visibleColumnIds,
  isSearching,
  searchQuery,
}: SessionsViewProps) {
  const effectiveVisibleColumnIds = useMemo(
    () => (isSearching ? visibleColumnIds : visibleColumnIds.filter((id) => id !== "searchMatches")),
    [visibleColumnIds, isSearching],
  )
  // Inline expansion (independent of the row-body click, which opens the panel).
  // The chevron toggles `expandedIds`; `showAllInSessionIds` is the per-session
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() =>
    activeSessionId ? new Set([activeSessionId]) : new Set(),
  )
  const [showAllInSessionIds, setShowAllInSessionIds] = useState<ReadonlySet<string>>(new Set())
  const toggleShowAllForSession = useCallback((sessionId: string) => {
    setShowAllInSessionIds((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }, [])

  const toggleSessionExpanded = useCallback((sessionId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
    // Collapsing resets the matches-only view for next time.
    setShowAllInSessionIds((prev) => {
      if (!prev.has(sessionId)) return prev
      const next = new Set(prev)
      next.delete(sessionId)
      return next
    })
  }, [])

  // Row click ensures the session is expanded (never collapses — that's the
  // chevron's job), so returning to a session from one of its traces keeps the
  // inline trace rows visible instead of toggling them shut.
  const expandSession = useCallback((sessionId: string) => {
    setExpandedIds((prev) => (prev.has(sessionId) ? prev : new Set([...prev, sessionId])))
  }, [])

  const collapseSession = useCallback((sessionId: string) => {
    setExpandedIds((prev) => {
      if (!prev.has(sessionId)) return prev
      const next = new Set(prev)
      next.delete(sessionId)
      return next
    })
    setShowAllInSessionIds((prev) => {
      if (!prev.has(sessionId)) return prev
      const next = new Set(prev)
      next.delete(sessionId)
      return next
    })
  }, [])

  const hasActiveFilters = Object.keys(filters).length > 0
  const isRelevanceSort = sorting.column === RELEVANCE_SORT_COLUMN

  const {
    data: sessions,
    isLoading,
    infiniteScroll,
    searchMatches,
  } = useSessionsInfiniteScroll({
    projectId,
    sorting,
    ...(hasActiveFilters ? { filters } : {}),
    ...(searchQuery ? { searchQuery } : {}),
  })

  const { data: sessionMetrics, isLoading: sessionMetricsLoading } = useSessionMetrics({
    projectId,
    ...(hasActiveFilters ? { filters } : {}),
  })

  // Fetch annotation counts for every trace that could show in the visible
  // session rows (trace_ids on each session) so the Indicators column can
  // surface positive / negative annotation badges. For multi-trace sessions
  // the badge totals are the sum across the session's traces.
  const sessionRelevantTraceIds = useMemo(() => {
    const set = new Set<string>()
    for (const s of sessions) {
      for (const id of s.traceIds) set.add(id)
    }
    return Array.from(set)
  }, [sessions])

  const { data: annotationCounts, pendingTraceIds: annotationCountsPendingTraceIds } = useAnnotationCountsByTraceIds({
    projectId,
    traceIds: sessionRelevantTraceIds,
    enabled: sessionRelevantTraceIds.length > 0,
  })

  const getRowAnnotationCounts = useCallback(
    (row: SessionTableRow) => {
      if (row.kind === "trace") {
        return annotationCounts.get(row.trace.traceId)
      }
      let positiveCount = 0
      let negativeCount = 0
      let found = false
      for (const id of row.session.traceIds) {
        const counts = annotationCounts.get(id)
        if (!counts) continue
        positiveCount += counts.positiveCount
        negativeCount += counts.negativeCount
        found = true
      }
      return found ? { positiveCount, negativeCount } : undefined
    },
    [annotationCounts],
  )

  const isRowAnnotationCountsPending = useCallback(
    (row: SessionTableRow) => {
      if (row.kind === "trace") return annotationCountsPendingTraceIds.has(row.trace.traceId)
      return row.session.traceIds.some((id) => annotationCountsPendingTraceIds.has(id))
    },
    [annotationCountsPendingTraceIds],
  )

  const allColumns = useMemo((): InfiniteTableColumn<SessionTableRow>[] => {
    return [
      {
        key: "indicators",
        header: "Indicators",
        width: 88,
        minWidth: 88,
        maxWidth: 88,
        resizable: false,
        ellipsis: false,
        cellClassName: "px-0",
        render: (row) => (
          <IndicatorsCell
            errorCount={field(row, "errorCount")}
            annotationCounts={getRowAnnotationCounts(row)}
            annotationCountsPending={isRowAnnotationCountsPending(row)}
          />
        ),
      },
      {
        key: "lastActivity",
        header: "Last Activity",
        sortKey: "lastActivity",
        width: 210,
        // For session rows, surface the most recent span start; expanded trace
        // children show their own start time since traces don't carry a
        // separate "last activity" signal.
        render: (row) => {
          const time = row.kind === "session" ? row.session.lastActivityTime : row.trace.startTime
          return (
            <Tooltip asChild trigger={<span>{relativeTime(new Date(time))}</span>}>
              {new Date(time).toLocaleString()}
            </Tooltip>
          )
        },
        renderSubheader: () =>
          isRelevanceSort ? (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Sorted by relevance
            </span>
          ) : null,
      },
      {
        key: "name",
        header: "Name",
        width: 180,
        render: (row) => {
          const name = field(row, "rootSpanName")
          if (name) return name
          if (row.kind === "trace") return row.trace.traceId.slice(0, 8)
          return EMPTY_CELL
        },
      },
      {
        key: "tags",
        header: "Tags",
        width: 150,
        render: (row) => <TagList tags={field(row, "tags")} />,
      },
      {
        key: "searchMatches",
        header: "Matching traces",
        width: 150,
        // Empty cell when no match metadata exists for the session (or the row
        // is a child trace). The column is always declared so the visible-
        // column-ids logic doesn't need a search-mode branch; presence of the
        // pill alone signals search-mode to the eye.
        render: (row) => {
          if (row.kind !== "session") return EMPTY_CELL
          const match = searchMatches?.[row.session.sessionId]
          if (!match) return EMPTY_CELL
          return (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {match.matchingTraceCount} matching trace
              {match.matchingTraceCount === 1 ? "" : "s"}
            </span>
          )
        },
      },
      {
        key: "duration",
        header: "Duration",
        align: "end",
        sortKey: "duration",
        width: 140,
        // JSX wrap (vs returning a plain string) avoids DataRow's auto-`Text.H5`
        // wrap, which would apply `text-left` and override the td's `text-right`.
        render: (row) => {
          const duration = field(row, "durationNs")
          return (
            <span className="flex items-center justify-end gap-1">
              {row.kind === "session" && (
                <SessionOutlierBadge
                  projectId={projectId}
                  tags={row.session.tags}
                  value={duration}
                  metric="durationNs"
                />
              )}
              {duration > 0 ? formatDuration(duration) : "-"}
            </span>
          )
        },
        renderSubheader: () => (
          <TableMetricSubheader
            rollup={sessionMetrics && sessionMetrics.durationNs.max > 0 ? sessionMetrics.durationNs : undefined}
            format="duration"
            isLoading={sessionMetricsLoading}
          />
        ),
      },
      {
        key: "ttft",
        header: "Time To First Token",
        align: "end",
        sortKey: "ttft",
        width: 176,
        render: (row) => {
          const ttft = field(row, "timeToFirstTokenNs")
          return (
            <span className="flex items-center justify-end gap-1">
              {row.kind === "session" && (
                <SessionOutlierBadge
                  projectId={projectId}
                  tags={row.session.tags}
                  value={ttft}
                  metric="timeToFirstTokenNs"
                />
              )}
              {ttft > 0 ? formatDuration(ttft) : "-"}
            </span>
          )
        },
        renderSubheader: () => (
          <TableMetricSubheader
            rollup={
              sessionMetrics && sessionMetrics.timeToFirstTokenNs.max > 0
                ? sessionMetrics.timeToFirstTokenNs
                : undefined
            }
            format="duration"
            isLoading={sessionMetricsLoading}
          />
        ),
      },
      {
        key: "cost",
        header: "Cost",
        align: "end",
        sortKey: "cost",
        width: 146,
        render: (row) => {
          const costTotalMicrocents = field(row, "costTotalMicrocents")
          return (
            <span className="flex items-center justify-end gap-1">
              {row.kind === "session" && (
                <SessionOutlierBadge
                  projectId={projectId}
                  tags={row.session.tags}
                  value={costTotalMicrocents}
                  metric="costTotalMicrocents"
                />
              )}
              {costTotalMicrocents > 0 ? formatPrice(costTotalMicrocents / 100_000_000) : "-"}
            </span>
          )
        },
        renderSubheader: () => (
          <TableMetricSubheader
            rollup={
              sessionMetrics && sessionMetrics.costTotalMicrocents.max > 0
                ? sessionMetrics.costTotalMicrocents
                : undefined
            }
            format="price"
            isLoading={sessionMetricsLoading}
          />
        ),
      },
      {
        key: "sessionId",
        header: "Session ID",
        width: 160,
        render: (row) => {
          if (row.kind === "session") {
            return <span className="block max-w-full truncate">{row.session.sessionId}</span>
          }
          return row.trace.sessionId
        },
      },
      {
        key: "userId",
        header: "User ID",
        width: 160,
        render: (row) => field(row, "userId"),
      },
      {
        key: "models",
        header: "Models",
        width: 160,
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
        width: 110,
        render: (row) => <span>{formatCount(field(row, "spanCount"))}</span>,
        renderSubheader: () => (
          <TableMetricSubheader rollup={sessionMetrics?.spanCount} format="count" isLoading={sessionMetricsLoading} />
        ),
      },
    ]
  }, [
    sessionMetrics,
    sessionMetricsLoading,
    getRowAnnotationCounts,
    isRowAnnotationCountsPending,
    searchMatches,
    isRelevanceSort,
  ])

  const columns = useMemo(() => {
    const columnsById = new Map(allColumns.map((column) => [column.key, column]))
    return effectiveVisibleColumnIds.flatMap((columnId) => {
      const column = columnsById.get(columnId)
      return column ? [column] : []
    })
  }, [allColumns, effectiveVisibleColumnIds])

  const traceMap = useExpandedSessionTraces(projectId, expandedIds, sessions)

  const selection = useSessionSelectionAdapter({
    selectionState,
    onSelectionChange,
    sessions,
    totalTraceCount,
    expandedTraces: traceMap,
  })

  const tableData: readonly SessionTableRow[] = sessions.map(
    (session): SessionTableRow => ({ kind: "session", session }),
  )

  const getRowKey = (row: SessionTableRow) => (row.kind === "session" ? row.session.sessionId : row.trace.traceId)

  const isSessionExpandable = useCallback(
    (row: SessionTableRow) => row.kind === "session" && row.session.traceCount > 1,
    [],
  )

  const onRowClick = (row: SessionTableRow) => {
    const sel = window.getSelection()
    if (sel && sel.toString().length > 0) return
    if (row.kind === "session") {
      const sessionId = row.session.sessionId
      if (activeSessionId === sessionId && !activeTraceId) {
        collapseSession(sessionId)
        onCloseSession()
        return
      }
      onOpenSession(sessionId)
      if (row.session.traceCount > 1) expandSession(sessionId)
    } else {
      onOpenSession(row.trace.sessionId, row.trace.traceId)
    }
  }

  const onToggleExpand = useCallback(
    (row: SessionTableRow) => {
      if (row.kind === "session") toggleSessionExpanded(row.session.sessionId)
    },
    [toggleSessionExpanded],
  )

  const getRowAriaLabel = useCallback((row: SessionTableRow) => {
    if (row.kind === "session") {
      const short = row.session.rootSpanName || row.session.sessionId.slice(0, 8)
      return `View session ${short}`
    }
    const short = row.trace.rootSpanName || row.trace.traceId.slice(0, 8)
    return `View trace ${short}`
  }, [])

  // Flat set of every matching trace id across visible sessions → dim the
  // non-matching expanded sub-rows so search hits stand out (search mode only).
  const matchingTraceIdSet = useMemo(() => {
    if (!searchMatches) return undefined
    const set = new Set<string>()
    for (const match of Object.values(searchMatches)) {
      for (const id of match.matchingTraceIds) set.add(id)
    }
    return set
  }, [searchMatches])

  const getRowClassName = useCallback(
    (row: SessionTableRow, context: { isActive: boolean; isExpanded: boolean; isSubRow: boolean }) => {
      if (!matchingTraceIdSet || row.kind !== "trace" || !context.isSubRow) return undefined
      return matchingTraceIdSet.has(row.trace.traceId) ? undefined : "opacity-50"
    },
    [matchingTraceIdSet],
  )

  const getExpandedRows = (row: SessionTableRow): ExpandedRows<SessionTableRow> => {
    if (row.kind !== "session") return { data: [] }
    const sessionId = row.session.sessionId
    const entry = traceMap.get(sessionId)
    if (!entry) return { data: [], isLoading: true }

    // Search mode: default-hide non-matching traces behind a show/hide toggle row.
    const match = searchMatches?.[sessionId]
    if (match) {
      const matchingSet = new Set(match.matchingTraceIds)
      const showingAll = showAllInSessionIds.has(sessionId)
      const matchingTraces = entry.data.filter((t) => matchingSet.has(t.traceId))
      const visibleTraces = showingAll ? entry.data : matchingTraces
      const hiddenCount = entry.data.length - matchingTraces.length
      const header =
        hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => toggleShowAllForSession(sessionId)}
            className="flex w-full items-center justify-start gap-2 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showingAll ? <ChevronsDownUpIcon className="size-3.5" /> : <ChevronsUpDownIcon className="size-3.5" />}
            {showingAll ? "Hide" : "Show"} {hiddenCount} non-matching trace
            {hiddenCount === 1 ? "" : "s"}
          </button>
        ) : undefined
      return {
        data: visibleTraces.map((trace): SessionTableRow => ({ kind: "trace", trace })),
        isLoading: entry.isLoading,
        blankSlate: "No traces in this session",
        ...(header ? { header } : {}),
      }
    }

    return {
      data: entry.data.map((trace): SessionTableRow => ({ kind: "trace", trace })),
      isLoading: entry.isLoading,
      blankSlate: "No traces in this session",
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
          {...listingLayoutIntrinsicScroll.infiniteTable}
          data={tableData}
          isLoading={isLoading}
          columns={columns}
          getRowKey={getRowKey}
          onRowClick={onRowClick}
          onToggleExpand={onToggleExpand}
          getRowAriaLabel={getRowAriaLabel}
          getRowClassName={getRowClassName}
          {...(activeTraceId || activeSessionId ? { activeRowKey: activeTraceId || (activeSessionId as string) } : {})}
          selection={selection}
          infiniteScroll={infiniteScroll}
          sorting={sorting}
          defaultSorting={searchQuery ? DEFAULT_SEARCH_SORTING : DEFAULT_SESSION_SORTING}
          onSortChange={onSortingChange}
          blankSlate={hasActiveFilters || searchQuery ? "No sessions match the current search" : "No sessions found"}
          expandedRowKeys={expandedIds}
          getExpandedRows={getExpandedRows}
          isRowExpandable={isSessionExpandable}
        />
      </Layout.List>
    </Layout.Body>
  )
}
