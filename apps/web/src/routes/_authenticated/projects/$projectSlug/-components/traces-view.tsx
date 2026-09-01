import type { FilterSet } from "@domain/shared"
import type { InfiniteTableSorting } from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { type RefObject, useCallback, useMemo } from "react"
import { useAnnotationCountsByTraceIds } from "../../../../../domains/annotations/annotations.collection.ts"
import { useProjectScope } from "../../../../../domains/projects/project-scope.tsx"
import { useTraceMetrics, useTracesInfiniteScroll } from "../../../../../domains/traces/traces.collection.ts"
import type { TraceRecord } from "../../../../../domains/traces/traces.functions.ts"
import { ListingLayout as Layout, listingLayoutIntrinsicScroll } from "../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { type SelectionState, useSelectableRows } from "../../../../../lib/hooks/useSelectableRows.ts"
import { FiltersSidebar } from "./filters-sidebar.tsx"
import { DEFAULT_TRACE_TABLE_SORTING, ProjectTracesTable, type TraceColumnId } from "./project-traces-table.tsx"
import { DEFAULT_SEARCH_SORTING } from "./trace-page-state.ts"

interface TracesViewProps {
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
  readonly visibleColumnIds: readonly TraceColumnId[]
  readonly searchQuery?: string
  readonly selectable?: boolean
  /** Optional shared ancestor scroll container for page-level scrolling + sticky headers. */
  readonly scrollContainerRef?: RefObject<HTMLDivElement | null>
}

export function TracesView({
  projectId,
  filters,
  filtersOpen,
  activeTraceId,
  activeDrawerTab,
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
  selectable = true,
  scrollContainerRef,
}: TracesViewProps) {
  const hasActiveFilters = Object.keys(filters).length > 0
  const hasSearchQuery = !!searchQuery && searchQuery.length > 0
  // Annotations are an LLM-feedback feature — off in a sandbox. Skip the fetch
  // and hide the badges/click affordance when reading under a sandbox scope.
  const annotationsEnabled = useProjectScope().kind === "live"

  const {
    data: traces,
    isLoading,
    infiniteScroll,
  } = useTracesInfiniteScroll({
    projectId,
    sorting,
    ...(hasActiveFilters ? { filters } : {}),
    ...(hasSearchQuery ? { searchQuery } : {}),
  })

  const { data: traceMetrics, isLoading: metricsLoading } = useTraceMetrics({
    projectId,
    ...(hasActiveFilters ? { filters } : {}),
    ...(hasSearchQuery ? { searchQuery } : {}),
  })
  const traceIds = useMemo(() => traces.map((t) => t.traceId), [traces])
  const { data: annotationCounts, pendingTraceIds: annotationCountsPendingTraceIds } = useAnnotationCountsByTraceIds({
    projectId,
    traceIds,
    enabled: annotationsEnabled && traceIds.length > 0,
  })

  // Write trace IDs into the shared ref during render so the parent can navigate next/prev without a callback effect
  traceIdsRef.current = traceIds
  const selection = useSelectableRows({
    rowIds: traceIds,
    totalRowCount: totalTraceCount,
    controlledState: selectionState,
    onStateChange: onSelectionChange,
  })

  const [, setTraceDetailTab] = useParamState("traceDetailTab", "trace")

  const handleTraceClick = useCallback(
    (trace: TraceRecord) => {
      onActiveTraceChange(trace.traceId === activeTraceId ? undefined : trace.traceId)
    },
    [activeTraceId, onActiveTraceChange],
  )

  const handleErrorClick = useCallback(
    (trace: TraceRecord) => {
      onActiveTraceChange(trace.traceId)
      setTraceDetailTab("spans")
    },
    [onActiveTraceChange, setTraceDetailTab],
  )

  const handleAnnotationClick = useCallback(
    (trace: TraceRecord) => {
      onActiveTraceChange(trace.traceId)
      setTraceDetailTab("scores")
    },
    [onActiveTraceChange, setTraceDetailTab],
  )

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

  const hasExternalScrollArea = scrollContainerRef !== undefined

  return (
    <Layout.Body {...(hasExternalScrollArea ? { className: "flex-none overflow-visible" } : {})}>
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
        <ProjectTracesTable
          {...(hasExternalScrollArea
            ? { scrollAreaLayout: "external" as const, scrollContainerRef }
            : listingLayoutIntrinsicScroll.projectTracesTable)}
          projectId={projectId}
          data={traces}
          isLoading={isLoading}
          visibleColumnIds={visibleColumnIds}
          onTraceClick={handleTraceClick}
          onErrorClick={handleErrorClick}
          {...(annotationsEnabled ? { onAnnotationClick: handleAnnotationClick } : {})}
          getTraceRowAriaLabel={getRowAriaLabel}
          {...(activeTraceId ? { activeTraceId } : {})}
          {...(selectable ? { selection } : {})}
          infiniteScroll={infiniteScroll}
          sorting={sorting}
          defaultSorting={hasSearchQuery ? DEFAULT_SEARCH_SORTING : DEFAULT_TRACE_TABLE_SORTING}
          onSortChange={onSortingChange}
          blankSlate={
            hasSearchQuery
              ? "No traces match the search query"
              : hasActiveFilters
                ? "No traces match the current filters"
                : "No traces found"
          }
          traceMetrics={traceMetrics}
          metricsLoading={metricsLoading}
          {...(annotationsEnabled ? { annotationCounts, annotationCountsPendingTraceIds } : {})}
        />
      </Layout.List>
    </Layout.Body>
  )
}
