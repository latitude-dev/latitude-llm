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
import { ChevronsDownUpIcon, ChevronsUpDownIcon } from "lucide-react"
import { type RefObject, useCallback, useMemo, useState } from "react"
import { useAnnotationCountsByTraceIds } from "../../../../../domains/annotations/annotations.collection.ts"
import { useSessionMetrics, useSessionsInfiniteScroll } from "../../../../../domains/sessions/sessions.collection.ts"
import type { SessionRecord } from "../../../../../domains/sessions/sessions.functions.ts"
import { listTracesByProject, type TraceRecord } from "../../../../../domains/traces/traces.functions.ts"
import { ListingLayout as Layout, listingLayoutIntrinsicScroll } from "../../../../../layouts/ListingLayout/index.tsx"
import { type SelectionState, useSelectableRows } from "../../../../../lib/hooks/useSelectableRows.ts"
import { FiltersSidebar } from "./filters-sidebar.tsx"
import { IndicatorsCell } from "./table/indicators-cell.tsx"
import { TableMetricSubheader } from "./table/metric-subheader.tsx"
import { DEFAULT_SEARCH_SORTING, RELEVANCE_SORT_COLUMN } from "./trace-page-state.ts"

type SessionTableRow =
  | { readonly kind: "session"; readonly session: SessionRecord }
  | { readonly kind: "trace"; readonly trace: TraceRecord }

function field<K extends keyof SessionRecord & keyof TraceRecord>(row: SessionTableRow, key: K) {
  return row.kind === "session" ? row.session[key] : row.trace[key]
}

const EMPTY_CELL = <Text.H5 color="foregroundMuted">-</Text.H5>

export const DEFAULT_SESSION_SORTING: InfiniteTableSorting = { column: "lastActivity", direction: "desc" }

const SESSION_TRACES_LIMIT = 25

export const SESSION_COLUMN_OPTIONS = [
  { id: "indicators", label: "Indicators" },
  { id: "lastActivity", label: "Last Activity", required: true },
  { id: "name", label: "Name" },
  { id: "tags", label: "Tags" },
  { id: "searchMatches", label: "Matching traces" },
  { id: "duration", label: "Duration" },
  { id: "ttft", label: "Time To First Token" },
  { id: "cost", label: "Cost" },
  { id: "sessionId", label: "Session ID" },
  { id: "userId", label: "User ID" },
  { id: "models", label: "Models" },
  { id: "spans", label: "Spans" },
] as const

export type SessionColumnId = (typeof SESSION_COLUMN_OPTIONS)[number]["id"]

function useExpandedSessionTraces(
  projectId: string,
  expandedIds: ReadonlySet<string>,
  sessions: readonly SessionRecord[],
) {
  const expandedSessionIds = useMemo(
    () => sessions.filter((s) => expandedIds.has(s.sessionId)).map((s) => s.sessionId),
    [sessions, expandedIds],
  )

  const results = useQueries({
    queries: expandedSessionIds.map((sessionId) => ({
      queryKey: ["session-traces", projectId, sessionId],
      queryFn: async () => {
        // Child traces are always shown in chronological order — they form a
        // conversation, and reading order is what users want regardless of
        // how the parent sessions list is sorted.
        const result = await listTracesByProject({
          data: {
            projectId,
            limit: SESSION_TRACES_LIMIT,
            sortBy: "startTime",
            sortDirection: "asc",
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
      const isLoading = r.isPending || (r.isFetching && r.data === undefined)
      if (r.data) {
        traceMap.set(r.data.sessionId, { data: r.data.traces, isLoading })
      } else {
        traceMap.set(sessionId, { data: [], isLoading })
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
  readonly sorting: InfiniteTableSorting
  readonly onSortingChange: (sorting: InfiniteTableSorting) => void
  readonly selectionState: SelectionState<string>
  readonly onSelectionChange: (state: SelectionState<string>) => void
  readonly totalTraceCount: number
  readonly onFiltersChange: (filters: FilterSet) => void
  readonly onFiltersClose: () => void
  readonly onActiveTraceChange: (traceId: string | undefined) => void
  readonly traceIdsRef: RefObject<string[]>
  readonly visibleColumnIds: readonly SessionColumnId[]
  /**
   * Free-text search query forwarded to `listSessionsByProject`. Optional —
   * the project page's Sessions tab (the original consumer) renders this view
   * without search, and the temporary `/session-search` route passes the
   * current query through.
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
  activeTraceId,
  activeDrawerTab: _activeDrawerTab,
  sorting,
  onSortingChange,
  selectionState,
  onSelectionChange,
  totalTraceCount,
  onFiltersChange,
  onFiltersClose,
  onActiveTraceChange,
  traceIdsRef,
  visibleColumnIds,
  searchQuery,
}: SessionsViewProps) {
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set())
  // Per-session "show non-matching traces" toggle (search mode only). Two-way
  // — the header row stays visible while the session is expanded and flips
  // between show/hide states. The only auto-reset is on session collapse,
  // wired into `onRowClick` below so we don't need a `useEffect` to sync.
  const [showAllInSessionIds, setShowAllInSessionIds] = useState<ReadonlySet<string>>(new Set())
  const toggleShowAllForSession = useCallback((sessionId: string) => {
    setShowAllInSessionIds((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
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
              {match.matchingTraceCount} matching trace{match.matchingTraceCount === 1 ? "" : "s"}
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
          return <span>{duration > 0 ? formatDuration(duration) : "-"}</span>
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
          return <span>{ttft > 0 ? formatDuration(ttft) : "-"}</span>
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
          return <span>{costTotalMicrocents > 0 ? formatPrice(costTotalMicrocents / 100_000_000) : "-"}</span>
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
        // Errors moved to the dedicated `indicators` column.
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
    return visibleColumnIds.flatMap((columnId) => {
      const column = columnsById.get(columnId)
      return column ? [column] : []
    })
  }, [allColumns, visibleColumnIds])

  const traceMap = useExpandedSessionTraces(projectId, expandedIds, sessions)

  const selection = useSessionSelectionAdapter({
    selectionState,
    onSelectionChange,
    sessions,
    totalTraceCount,
  })

  const tableData: readonly SessionTableRow[] = sessions.map(
    (session): SessionTableRow => ({ kind: "session", session }),
  )
  // Drawer prev/next navigates traces in ingestion order across every visible
  // session (matching the project Sessions tab today). Search-mode treats
  // matching vs. non-matching as a visual cue, not a navigation distinction,
  // so we always concatenate the full `traceIds` from each session in page
  // order — `bestTraceId` lookups slot in naturally because they're members
  // of their session's `traceIds`.
  traceIdsRef.current = sessions.flatMap((s) => Array.from(s.traceIds))

  const getRowKey = (row: SessionTableRow) => (row.kind === "session" ? row.session.sessionId : row.trace.traceId)

  const isSessionExpandable = useCallback(
    (row: SessionTableRow) => row.kind === "session" && row.session.traceCount > 1,
    [],
  )

  const onRowClick = (row: SessionTableRow) => {
    if (row.kind === "session") {
      // Single-trace sessions (including orphan-as-session) have nothing
      // meaningful to expand into, so the row click drops straight to the
      // drawer on that one trace.
      if (row.session.traceCount <= 1) {
        const traceId = row.session.traceIds[0]
        if (!traceId) return
        onActiveTraceChange(traceId === activeTraceId ? undefined : traceId)
        return
      }
      // Multi-trace sessions toggle expansion regardless of search mode.
      // Expansion shows the full conversation with matching traces visually
      // flagged — the most useful action when triaging a search hit. Users
      // can then click individual trace rows to open the drawer.
      //
      // Collapse also resets `showAllInSessionIds` for this session so the
      // next expansion starts in the matches-only state (per UX: the only
      // way to re-hide non-matching traces is to collapse the session).
      const sessionId = row.session.sessionId
      setExpandedIds((prev) => {
        const next = new Set(prev)
        if (next.has(sessionId)) next.delete(sessionId)
        else next.add(sessionId)
        return next
      })
      setShowAllInSessionIds((prev) => {
        if (!prev.has(sessionId)) return prev
        const next = new Set(prev)
        next.delete(sessionId)
        return next
      })
    } else {
      const sel = window.getSelection()
      if (sel && sel.toString().length > 0) return
      onActiveTraceChange(row.trace.traceId === activeTraceId ? undefined : row.trace.traceId)
    }
  }

  // Flat set of every matching trace id across the visible session rows, used
  // by `getRowClassName` to flag matching expanded trace rows. Computed once
  // per `searchMatches` change so the per-row hot path is an O(1) lookup
  // instead of a nested object access per render.
  const matchingTraceIdSet = useMemo(() => {
    if (!searchMatches) return undefined
    const set = new Set<string>()
    for (const match of Object.values(searchMatches)) {
      for (const id of match.matchingTraceIds) set.add(id)
    }
    return set
  }, [searchMatches])

  // Dim NON-matching expanded trace rows to 50% opacity so the matching
  // turns stand out by contrast. We tried positive-highlight approaches
  // first (outer aura, inset ring with rounded corners) but they ran into
  // layout constraints: the parent scroll container clipped horizontally,
  // adjacent rows left no vertical space for an outer glow, and an inset
  // ring competed visually with the row's active-state outline. Dimming
  // non-matches sidesteps all of that — the matching rows stay fully
  // legible at default opacity, the surrounding rows fade enough to read
  // as supporting context. `opacity` doesn't change pointer-events, so
  // every row stays clickable.
  const getRowClassName = useCallback(
    (row: SessionTableRow, context: { isActive: boolean; isExpanded: boolean; isSubRow: boolean }) => {
      if (!matchingTraceIdSet || row.kind !== "trace" || !context.isSubRow) return undefined
      return matchingTraceIdSet.has(row.trace.traceId) ? undefined : "opacity-50"
    },
    [matchingTraceIdSet],
  )

  const getRowAriaLabel = useCallback(
    (row: SessionTableRow) => {
      if (row.kind === "session") {
        const id = row.session.sessionId
        if (row.session.traceCount <= 1) {
          const traceId = row.session.traceIds[0] ?? id
          const short = row.session.rootSpanName || traceId.slice(0, 8)
          return traceId === activeTraceId ? `Deselect trace ${short}` : `View trace ${short}`
        }
        return expandedIds.has(id) ? `Collapse session ${id}` : `Expand session ${id}`
      }
      const short = row.trace.rootSpanName || row.trace.traceId.slice(0, 8)
      return row.trace.traceId === activeTraceId ? `Deselect trace ${short}` : `View trace ${short}`
    },
    [expandedIds, activeTraceId],
  )

  const getExpandedRows = (row: SessionTableRow): ExpandedRows<SessionTableRow> => {
    if (row.kind !== "session") return { data: [] }
    const sessionId = row.session.sessionId
    const entry = traceMap.get(sessionId)
    if (!entry) return { data: [], isLoading: true }

    // Search mode + we know which traces matched → default-hide the rest.
    // Render a full-width toggle row above the matches with a count and
    // double-chevron icon; it stays visible the whole time and flips
    // between show/hide. Session collapse still resets the toggle so the
    // next expansion starts in the matches-only state (handled in
    // onRowClick, which prunes `showAllInSessionIds`).
    const match = searchMatches?.[sessionId]
    if (match) {
      const matchingSet = new Set(match.matchingTraceIds)
      const showingAll = showAllInSessionIds.has(sessionId)
      const visibleTraces = showingAll ? entry.data : entry.data.filter((t) => matchingSet.has(t.traceId))
      const hiddenCount = entry.data.length - matchingSet.size
      const header =
        hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => toggleShowAllForSession(sessionId)}
            // The InfiniteTable's `header` slot already injects empty cells
            // matching the expand + selection columns, so `px-4` here aligns
            // with the first data column's content (Indicators).
            className="flex w-full items-center justify-start gap-2 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showingAll ? <ChevronsDownUpIcon className="size-3.5" /> : <ChevronsUpDownIcon className="size-3.5" />}
            {showingAll ? "Hide" : "Show"} {hiddenCount} non-matching trace{hiddenCount === 1 ? "" : "s"}
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
          getRowAriaLabel={getRowAriaLabel}
          getRowClassName={getRowClassName}
          {...(activeTraceId ? { activeRowKey: activeTraceId } : {})}
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
