import type { FilterSet } from "@domain/shared"
import {
  Button,
  type ExpandedRows,
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableSorting,
  ProviderIcon,
  TagList,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatDuration, formatPercentage, relativeTime } from "@repo/utils"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { useQueries } from "@tanstack/react-query"
import { ChevronsDownUpIcon, ChevronsUpDownIcon } from "lucide-react"
import { type MouseEvent, type ReactNode, type RefObject, useCallback, useMemo, useState } from "react"
import { useAnnotationCountsByTraceIds } from "../../../../../domains/annotations/annotations.collection.ts"
import { sandboxOrgIdForScope, useProjectScope } from "../../../../../domains/projects/project-scope.tsx"
import {
  isHasLlmActivityFilterOn,
  useSessionMetrics,
  useSessionsCountWithoutLlmActivityFilter,
  useSessionsInfiniteScroll,
} from "../../../../../domains/sessions/sessions.collection.ts"
import type { SessionRecord, SessionSearchMatchRecord } from "../../../../../domains/sessions/sessions.functions.ts"
import { rollupCostDisplay } from "../../../../../domains/spans/cost-display.ts"
import type { TraceRecord } from "../../../../../domains/traces/traces.functions.ts"
import { ListingLayout as Layout, listingLayoutIntrinsicScroll } from "../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import type { SelectionState } from "../../../../../lib/hooks/useSelectableRows.ts"
import { FiltersSidebar } from "./filters-sidebar.tsx"
import { isLargeSession, MAX_SESSION_ANALYSIS_TRACE_COUNT } from "./session-detail-drawer/session-size.ts"
import { sessionTracePageQueryOptions } from "./session-detail-drawer/use-session-traces.ts"
import { SessionOutlierBadge } from "./session-outlier-badge.tsx"
import { SessionsOrphanFragmentsBlankSlate } from "./sessions-orphan-fragments-blank-slate.tsx"
import { CacheHitRateSubheader } from "./table/cache-hit-rate-subheader.tsx"
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
const EXPANDED_TRACE_PAGE_SIZE = 25

function expandedTraceStateKey(searchQuery: string | undefined, sessionId: string) {
  return `${searchQuery ?? ""}:${sessionId}`
}

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
  { id: "cacheHitRate", label: "Cache Hit Rate" },
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

function useExpandedSessionTraces({
  projectId,
  expandedIds,
  sessions,
  searchMatches,
  showAllInSessionIds,
  visibleTraceCountBySessionId,
  searchQuery,
}: {
  readonly projectId: string
  readonly expandedIds: ReadonlySet<string>
  readonly sessions: readonly SessionRecord[]
  readonly searchMatches: Readonly<Record<string, SessionSearchMatchRecord>> | undefined
  readonly showAllInSessionIds: ReadonlySet<string>
  readonly visibleTraceCountBySessionId: ReadonlyMap<string, number>
  readonly searchQuery: string | undefined
}) {
  const scope = useProjectScope()
  const expandedSessions = useMemo(
    () =>
      sessions
        .filter((session) => expandedIds.has(session.sessionId))
        .map((session) => {
          const stateKey = expandedTraceStateKey(searchQuery, session.sessionId)
          const match = searchMatches?.[session.sessionId]
          const showingAll = showAllInSessionIds.has(stateKey)
          return {
            session,
            traceIds: match && !showingAll ? match.matchingTraceIds : session.traceIds,
            limit: visibleTraceCountBySessionId.get(stateKey) ?? EXPANDED_TRACE_PAGE_SIZE,
          }
        }),
    [expandedIds, searchMatches, searchQuery, sessions, showAllInSessionIds, visibleTraceCountBySessionId],
  )

  const results = useQueries({
    queries: expandedSessions.map(({ session, traceIds, limit }) =>
      sessionTracePageQueryOptions(sandboxOrgIdForScope(scope), projectId, session.sessionId, traceIds, limit, {
        sortDirection: "desc",
      }),
    ),
  })

  return useMemo(() => {
    const traceMap = new Map<
      string,
      { data: readonly TraceRecord[]; hasMore: boolean; isLoading: boolean; isLoadingMore: boolean }
    >()
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const expanded = expandedSessions[i]
      if (!result || !expanded) continue
      const isLoading = result.isPending || (result.isFetching && result.data === undefined)
      traceMap.set(expanded.session.sessionId, {
        data: result.data?.traces ?? [],
        hasMore: result.data?.hasMore ?? false,
        isLoading,
        isLoadingMore: result.isFetching && result.data !== undefined,
      })
    }
    return traceMap
  }, [results, expandedSessions])
}

interface SessionsViewProps {
  readonly projectId: string
  readonly filters: FilterSet
  readonly filtersOpen: boolean
  readonly activeSessionId: string | undefined
  readonly activeTraceId?: string | undefined
  readonly sorting: InfiniteTableSorting
  readonly onSortingChange: (sorting: InfiniteTableSorting) => void
  readonly selectionState: SelectionState<string>
  readonly onSelectionChange: (state: SelectionState<string>) => void
  readonly totalTraceCount: number
  readonly onFiltersChange: (filters: FilterSet) => void
  readonly onShowAllSessions: () => void
  readonly onFiltersClose: () => void
  readonly onOpenSession: (sessionId: string, traceId?: string) => void
  readonly onCloseSession: () => void
  readonly visibleColumnIds: readonly SessionColumnId[]
  readonly isSearching: boolean
  readonly hasUserAppliedFilters: boolean
  readonly selectable?: boolean
  readonly searchQuery?: string
  /** Filter fields to hide in the built-in sidebar (e.g. `topics`). */
  readonly excludeFilterFields?: readonly string[]
  /**
   * The ancestor scroll container to virtualize against — shared with whatever else
   * the caller stacks above it (e.g. an aggregations chart), so the page scrolls as
   * one and the table's header sticks once it reaches the top. When omitted the
   * table falls back to scrolling within its own bounded box, as before.
   */
  readonly scrollContainerRef?: RefObject<HTMLDivElement | null>
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
  onShowAllSessions,
  onFiltersClose,
  onOpenSession,
  onCloseSession,
  visibleColumnIds,
  isSearching,
  hasUserAppliedFilters,
  searchQuery,
  selectable = true,
  excludeFilterFields,
  scrollContainerRef,
}: SessionsViewProps) {
  // Annotations are an LLM-feedback feature — off under a sandbox scope. Skip
  // the counts fetch so the Indicators column shows errors only (mirrors the
  // Traces table's `annotationsEnabled` gate).
  const annotationsEnabled = useProjectScope().kind === "live"
  const effectiveVisibleColumnIds = useMemo(
    () => (isSearching ? visibleColumnIds : visibleColumnIds.filter((id) => id !== "searchMatches")),
    [visibleColumnIds, isSearching],
  )
  // Inline expansion is independent of the row-body click, which opens the panel.
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set())
  const [showAllInSessionIds, setShowAllInSessionIds] = useState<ReadonlySet<string>>(new Set())
  const [visibleTraceCountBySessionId, setVisibleTraceCountBySessionId] = useState<ReadonlyMap<string, number>>(
    new Map(),
  )
  const expansionStateKey = useCallback((sessionId: string) => `${searchQuery ?? ""}:${sessionId}`, [searchQuery])
  const toggleShowAllForSession = useCallback(
    (sessionId: string) => {
      const stateKey = expansionStateKey(sessionId)
      setShowAllInSessionIds((prev) => {
        const next = new Set(prev)
        if (next.has(stateKey)) next.delete(stateKey)
        else next.add(stateKey)
        return next
      })
    },
    [expansionStateKey],
  )

  const toggleSessionExpanded = useCallback(
    (sessionId: string) => {
      const stateKey = expansionStateKey(sessionId)
      setExpandedIds((prev) => {
        const next = new Set(prev)
        if (next.has(sessionId)) next.delete(sessionId)
        else next.add(sessionId)
        return next
      })
      setShowAllInSessionIds((prev) => {
        if (!prev.has(stateKey)) return prev
        const next = new Set(prev)
        next.delete(stateKey)
        return next
      })
      setVisibleTraceCountBySessionId((prev) => {
        if (!prev.has(stateKey)) return prev
        const next = new Map(prev)
        next.delete(stateKey)
        return next
      })
    },
    [expansionStateKey],
  )

  // Row click expands regular sessions without toggling them shut. Large
  // sessions wait for the explicit chevron so opening their drawer stays fast.
  const expandSession = useCallback((sessionId: string) => {
    setExpandedIds((prev) => (prev.has(sessionId) ? prev : new Set([...prev, sessionId])))
  }, [])

  const collapseSession = useCallback(
    (sessionId: string) => {
      const stateKey = expansionStateKey(sessionId)
      setExpandedIds((prev) => {
        if (!prev.has(sessionId)) return prev
        const next = new Set(prev)
        next.delete(sessionId)
        return next
      })
      setShowAllInSessionIds((prev) => {
        if (!prev.has(stateKey)) return prev
        const next = new Set(prev)
        next.delete(stateKey)
        return next
      })
      setVisibleTraceCountBySessionId((prev) => {
        if (!prev.has(stateKey)) return prev
        const next = new Map(prev)
        next.delete(stateKey)
        return next
      })
    },
    [expansionStateKey],
  )

  const loadMoreSessionTraces = useCallback(
    (sessionId: string) => {
      const stateKey = expansionStateKey(sessionId)
      setVisibleTraceCountBySessionId((prev) => {
        const next = new Map(prev)
        next.set(stateKey, (prev.get(stateKey) ?? EXPANDED_TRACE_PAGE_SIZE) + EXPANDED_TRACE_PAGE_SIZE)
        return next
      })
    },
    [expansionStateKey],
  )

  const isRelevanceSort = sorting.column === RELEVANCE_SORT_COLUMN

  const {
    data: sessions,
    isLoading,
    infiniteScroll,
    searchMatches,
  } = useSessionsInfiniteScroll({
    projectId,
    sorting,
    filters,
    ...(searchQuery ? { searchQuery } : {}),
  })

  const { data: sessionMetrics, isLoading: sessionMetricsLoading } = useSessionMetrics({
    projectId,
    filters,
  })

  const shouldCheckOrphanFragmentSessions =
    !isLoading && sessions.length === 0 && isHasLlmActivityFilterOn(filters) && !searchQuery
  const { totalCount: sessionsWithoutLlmActivityCount, isLoading: isOrphanFragmentCountLoading } =
    useSessionsCountWithoutLlmActivityFilter({
      projectId,
      filters,
      enabled: shouldCheckOrphanFragmentSessions,
    })
  const hasOrphanFragmentSessions =
    shouldCheckOrphanFragmentSessions && !isOrphanFragmentCountLoading && sessionsWithoutLlmActivityCount > 0

  const blankSlate = useMemo(() => {
    if (searchQuery) return "No sessions match the current search"
    if (hasOrphanFragmentSessions) {
      return <SessionsOrphanFragmentsBlankSlate onShowAllSessions={onShowAllSessions} />
    }
    if (hasUserAppliedFilters) return "No sessions match the current filters"
    return "No sessions found"
  }, [hasOrphanFragmentSessions, hasUserAppliedFilters, onShowAllSessions, searchQuery])

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
    enabled: annotationsEnabled && sessionRelevantTraceIds.length > 0,
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

  const [activeTraceTab, setActiveTraceTab] = useParamState("traceTab", "trace")
  const [activeSessionTab, setActiveSessionTab] = useParamState("sessionTab", "session")

  const openScoresForRow = useCallback(
    (row: SessionTableRow, event: MouseEvent) => {
      event.stopPropagation()
      if (row.kind === "session") {
        onOpenSession(row.session.sessionId)
        setActiveSessionTab("scores")
        return
      }
      onOpenSession(row.trace.sessionId, row.trace.traceId)
      setActiveTraceTab("scores")
    },
    [onOpenSession, setActiveSessionTab, setActiveTraceTab],
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
            {...(annotationsEnabled &&
            (row.kind === "trace" || row.session.traceIds.length <= MAX_SESSION_ANALYSIS_TRACE_COUNT)
              ? {
                  onAnnotationClick: (event: MouseEvent) => openScoresForRow(row, event),
                }
              : {})}
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
                <SessionOutlierBadge projectId={projectId} value={duration} metric="durationNs" />
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
                <SessionOutlierBadge projectId={projectId} value={ttft} metric="timeToFirstTokenNs" />
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
          const cost = rollupCostDisplay({
            costTotalMicrocents,
            unpricedSpanCount: field(row, "unpricedSpanCount"),
            tokensTotal: field(row, "tokensTotal"),
          })
          const cell = (
            <span className="flex items-center justify-end gap-1">
              {row.kind === "session" && (
                <SessionOutlierBadge projectId={projectId} value={costTotalMicrocents} metric="costTotalMicrocents" />
              )}
              {cost.label}
            </span>
          )
          if (!cost.note) return cell
          return (
            <Tooltip trigger={cell} asChild>
              {cost.note}
            </Tooltip>
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
        key: "cacheHitRate",
        header: "Cache Hit Rate",
        align: "end",
        width: 130,
        render: (row) => {
          const rate = field(row, "cacheHitRate")
          return <span>{rate === null ? "-" : formatPercentage(rate)}</span>
        },
        renderSubheader: () => (
          <CacheHitRateSubheader analytics={sessionMetrics?.tokenAnalytics} isLoading={sessionMetricsLoading} />
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
    annotationsEnabled,
    openScoresForRow,
  ])

  const columns = useMemo(() => {
    const columnsById = new Map(allColumns.map((column) => [column.key, column]))
    return effectiveVisibleColumnIds.flatMap((columnId) => {
      const column = columnsById.get(columnId)
      return column ? [column] : []
    })
  }, [allColumns, effectiveVisibleColumnIds])

  const traceMap = useExpandedSessionTraces({
    projectId,
    expandedIds,
    sessions,
    searchMatches,
    showAllInSessionIds,
    visibleTraceCountBySessionId,
    searchQuery,
  })

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
      if (row.session.traceCount > 1 && !isLargeSession(row.session)) expandSession(sessionId)
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

  // J/K navigate sessions, except when a spans tree is showing (it takes over
  // J/K, mirroring traces-view): the open trace's spans tab (`traceTab`), or a
  // single-trace session's own spans tab (`sessionTab`) when no trace is open.
  const spansTreeActive = activeTraceId
    ? activeTraceTab === "spans"
    : Boolean(activeSessionId) && activeSessionTab === "spans"
  const jkEnabled = !spansTreeActive
  useHotkeys([
    {
      hotkey: "J",
      callback: () => {
        const idx = activeSessionId ? sessions.findIndex((session) => session.sessionId === activeSessionId) : -1
        const next = sessions[idx + 1]
        if (next) onOpenSession(next.sessionId)
        else if (sessions.length > 0 && !activeSessionId) onOpenSession(sessions[0]!.sessionId)
      },
      options: { enabled: jkEnabled },
    },
    {
      hotkey: "K",
      callback: () => {
        const idx = activeSessionId
          ? sessions.findIndex((session) => session.sessionId === activeSessionId)
          : sessions.length
        const prev = sessions[idx - 1]
        if (prev) onOpenSession(prev.sessionId)
      },
      options: { enabled: jkEnabled },
    },
  ])

  const getExpandedRows = (row: SessionTableRow): ExpandedRows<SessionTableRow> => {
    if (row.kind !== "session") return { data: [] }
    const sessionId = row.session.sessionId
    const entry = traceMap.get(sessionId)
    if (!entry) return { data: [], isLoading: true }

    const stateKey = expansionStateKey(sessionId)
    const paginateTraces = (
      traces: readonly TraceRecord[],
      totalCount: number,
      leadingControl?: ReactNode,
    ): ExpandedRows<SessionTableRow> => {
      const displayLimitReached = !entry.isLoadingMore && !entry.hasMore && totalCount > traces.length
      const footer =
        leadingControl || entry.hasMore || entry.isLoadingMore || displayLimitReached ? (
          <div className="flex w-full items-center px-4 py-2">
            <div className="flex min-w-0 flex-1 items-center justify-start">{leadingControl}</div>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
              <Text.H6 color="foregroundMuted" noWrap>
                Showing {traces.length} of {totalCount} traces
                {displayLimitReached ? " (display limit reached)" : ""}
              </Text.H6>
              {entry.hasMore ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  disabled={entry.isLoadingMore}
                  onClick={() => loadMoreSessionTraces(sessionId)}
                >
                  {entry.isLoadingMore
                    ? "Loading…"
                    : `Load ${Math.min(EXPANDED_TRACE_PAGE_SIZE, Math.max(totalCount - traces.length, 0))} more`}
                </Button>
              ) : null}
            </div>
            <div className="flex-1" />
          </div>
        ) : undefined

      return {
        data: traces.map((trace): SessionTableRow => ({ kind: "trace", trace })),
        isLoading: entry.isLoading,
        blankSlate: "No traces in this session",
        ...(footer ? { header: footer } : {}),
      }
    }

    // Search mode: default-hide non-matching traces behind a show/hide toggle row.
    const match = searchMatches?.[sessionId]
    if (match) {
      const matchingSet = new Set(match.matchingTraceIds)
      const showingAll = showAllInSessionIds.has(stateKey)
      const matchingTraces = entry.data.filter((t) => matchingSet.has(t.traceId))
      const eligibleTraces = showingAll ? entry.data : matchingTraces
      const hiddenCount = row.session.traceCount - match.matchingTraceCount
      const searchControl =
        hiddenCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => toggleShowAllForSession(sessionId)}>
            {showingAll ? <ChevronsDownUpIcon className="size-3.5" /> : <ChevronsUpDownIcon className="size-3.5" />}
            {showingAll ? "Hide" : "Show"} {hiddenCount} non-matching trace
            {hiddenCount === 1 ? "" : "s"}
          </Button>
        ) : undefined
      return paginateTraces(
        eligibleTraces,
        showingAll ? row.session.traceCount : match.matchingTraceCount,
        searchControl,
      )
    }

    return paginateTraces(entry.data, row.session.traceCount)
  }

  const hasExternalScrollArea = scrollContainerRef !== undefined

  return (
    // `flex-none overflow-visible`: the default `flex-1 min-h-0 overflow-hidden` bounds
    // and clips this to the visible viewport, which is right when the table scrolls
    // itself — but with an external scroll container the table grows to its full row
    // count and that ancestor (shared with content stacked above it, e.g. an
    // aggregations chart) scrolls for it instead, so nothing here should clip.
    <Layout.Body {...(hasExternalScrollArea ? { className: "flex-none overflow-visible" } : {})}>
      {filtersOpen && (
        <FiltersSidebar
          mode="sessions"
          projectId={projectId}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onClose={onFiltersClose}
          {...(excludeFilterFields ? { excludeFields: excludeFilterFields } : {})}
        />
      )}
      <Layout.List>
        <InfiniteTable
          {...(hasExternalScrollArea
            ? { scrollAreaLayout: "external" as const, scrollContainerRef }
            : listingLayoutIntrinsicScroll.infiniteTable)}
          data={tableData}
          isLoading={isLoading}
          columns={columns}
          getRowKey={getRowKey}
          onRowClick={onRowClick}
          onToggleExpand={onToggleExpand}
          getRowAriaLabel={getRowAriaLabel}
          getRowClassName={getRowClassName}
          {...(activeTraceId || activeSessionId ? { activeRowKey: activeTraceId || (activeSessionId as string) } : {})}
          {...(selectable ? { selection } : {})}
          infiniteScroll={infiniteScroll}
          sorting={sorting}
          defaultSorting={searchQuery ? DEFAULT_SEARCH_SORTING : DEFAULT_SESSION_SORTING}
          onSortChange={onSortingChange}
          blankSlate={blankSlate}
          expandedRowKeys={expandedIds}
          getExpandedRows={getExpandedRows}
          isRowExpandable={isSessionExpandable}
        />
      </Layout.List>
    </Layout.Body>
  )
}
