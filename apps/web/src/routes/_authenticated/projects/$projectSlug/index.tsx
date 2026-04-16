import { type FilterSet, filterSetSchema } from "@domain/shared"
import { Button, Icon, type InfiniteTableSorting, Input, type SortDirection, Tabs, Tooltip } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { createFileRoute } from "@tanstack/react-router"
import {
  AppWindowIcon,
  ChevronDown,
  DatabaseIcon,
  FilterIcon,
  LayersIcon,
  MessagesSquareIcon,
  SearchIcon,
  TextIcon,
} from "lucide-react"
import { useCallback, useMemo, useRef, useState } from "react"
import { HotkeyBadge } from "../../../../components/hotkey-badge.tsx"
import { useProjectsCollection } from "../../../../domains/projects/projects.collection.ts"
import { useTraceCohortSummary, useTracesCount } from "../../../../domains/traces/traces.collection.ts"
import { ListingLayout as Layout } from "../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../lib/hooks/useParamState.ts"
import { type BulkSelection, EMPTY_SELECTION, type SelectionState } from "../../../../lib/hooks/useSelectableRows.ts"
import { TraceAggregationsPanel } from "./-components/aggregations/aggregations-panel.tsx"
import { ColumnsSelector } from "./-components/columns-selector.tsx"
import { TRACE_COLUMN_OPTIONS, type TraceColumnId } from "./-components/project-traces-table.tsx"
import { SessionsView } from "./-components/sessions-view.tsx"
import { TimeFilterDropdown } from "./-components/time-filter-dropdown.tsx"
import { TraceDetailDrawer } from "./-components/trace-detail-drawer.tsx"
import { TracesView } from "./-components/traces-view.tsx"
import { useRouteProject } from "./-route-data.ts"
import { AddToQueueModal } from "./annotation-queues/-components/add-to-queue-modal.tsx"
import { AddToDatasetModal } from "./datasets/-components/add-to-dataset-modal.tsx"

const DEFAULT_TRACE_SORTING: InfiniteTableSorting = { column: "startTime", direction: "desc" }

function parseFilters(raw?: string): FilterSet {
  if (!raw) return {}
  try {
    let parsed = JSON.parse(raw)
    // TanStack Router JSON-stringifies search param values. When we store a
    // pre-serialized JSON string (e.g. '{"startTime":...}'), it becomes
    // '"{\"startTime\":...}"' in the URL. Unwrap the extra layer if present.
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed)
    }
    return filterSetSchema.parse(parsed)
  } catch {
    return {}
  }
}

function serializeFilters(filters: FilterSet): string | undefined {
  const keys = Object.keys(filters)
  return keys.length > 0 ? JSON.stringify(filters) : undefined
}

function getTimeFilterValue(filters: FilterSet, op: "gte" | "lte"): string | undefined {
  const conds = filters.startTime
  if (!conds) return undefined
  const match = conds.find((c) => c.op === op)
  return match ? String(match.value) : undefined
}

const DEFAULT_TRACE_COLUMNS: TraceColumnId[] = TRACE_COLUMN_OPTIONS.map((column) => column.id)

function parseTraceColumnIds(raw?: string): TraceColumnId[] {
  const values = raw
    ?.split(",")
    .map((value) => value.trim())
    .filter((value): value is TraceColumnId => TRACE_COLUMN_OPTIONS.some((column) => column.id === value))

  if (!values || values.length === 0) {
    return [...DEFAULT_TRACE_COLUMNS]
  }

  return values.includes("startTime") ? values : ["startTime", ...values]
}

function serializeTraceColumnIds(columnIds: readonly TraceColumnId[]): string {
  return Array.from(new Set(["startTime", ...columnIds])).join(",")
}

function getSelectedCount(state: SelectionState<string>, total: number): number {
  switch (state.mode) {
    case "all":
      return total - state.excludedIds.size
    case "none":
      return 0
    case "partial":
      return state.selectedIds.size
    case "allExcept":
      return total - state.excludedIds.size
  }
}

function getBulkSelection(state: SelectionState<string>): BulkSelection<string> | null {
  switch (state.mode) {
    case "all":
      return { mode: "all" }
    case "allExcept":
      return { mode: "allExcept", rowIds: Array.from(state.excludedIds) }
    case "partial":
      return state.selectedIds.size > 0 ? { mode: "selected", rowIds: Array.from(state.selectedIds) } : null
    case "none":
      return null
  }
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/")({
  component: ProjectPage,
})

function ProjectPage() {
  const { projectSlug } = Route.useParams()
  const routeProject = useRouteProject()
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )
  const currentProject = project ?? routeProject
  const [activeTab, setActiveTab] = useParamState("tab", "traces", {
    validate: (v): v is "traces" | "sessions" => v === "traces" || v === "sessions",
  })
  const [filtersOpen, setFiltersOpen] = useParamState("filtersOpen", false)
  const [activeTraceId, setActiveTraceId] = useParamState("traceId", "")
  const [, setSelectedSpanId] = useParamState("spanId", "")
  const [rawFilters, setRawFilters] = useParamState("filters", "")
  const [sortBy, setSortBy] = useParamState("sortBy", DEFAULT_TRACE_SORTING.column)
  const [sortDirection, setSortDirection] = useParamState("sortDirection", DEFAULT_TRACE_SORTING.direction, {
    validate: (v): v is SortDirection => v === "asc" || v === "desc",
  })
  const [rawTraceColumns, setRawTraceColumns] = useParamState(
    "traceColumns",
    serializeTraceColumnIds(DEFAULT_TRACE_COLUMNS),
  )

  // Tracks which drawer tab is active so J/K knows when to defer to span navigation
  const [activeDrawerTab, setActiveDrawerTab] = useState<string>("trace")

  // Ref to the ordered list of trace IDs from the currently loaded table page
  const traceIdsRef = useRef<string[]>([])

  const filters = useMemo(() => parseFilters(rawFilters || undefined), [rawFilters])
  const visibleTraceColumnIds = parseTraceColumnIds(rawTraceColumns || undefined)
  const hasActiveFilters = Object.keys(filters).length > 0
  const timeFrom = getTimeFilterValue(filters, "gte")
  const timeTo = getTimeFilterValue(filters, "lte")
  const sorting: InfiniteTableSorting = { column: sortBy, direction: sortDirection }

  const [selectionState, setSelectionState] = useState<SelectionState<string>>(EMPTY_SELECTION)
  const [addToDatasetOpen, setAddToDatasetOpen] = useState(false)
  const [addToQueueOpen, setAddToQueueOpen] = useState(false)

  const { totalCount: totalTraceCount } = useTracesCount({
    projectId: currentProject.id,
    ...(hasActiveFilters ? { filters } : {}),
  })

  // Cohort baselines use a fixed 2-week window for stability (not affected by user time filters)
  const twoWeekBaselinesFilter = useMemo((): FilterSet => {
    const now = new Date()
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    return {
      startTime: [
        { op: "gte", value: twoWeeksAgo.toISOString() },
        { op: "lte", value: now.toISOString() },
      ],
    }
  }, [])

  const { data: cohortSummary } = useTraceCohortSummary({
    projectId: currentProject.id,
    filters: twoWeekBaselinesFilter,
  })

  const selectedCount = getSelectedCount(selectionState, totalTraceCount)
  const bulkSelection = getBulkSelection(selectionState)

  const onSortingChange = (next: InfiniteTableSorting) => {
    setSortBy(next.column)
    setSortDirection(next.direction)
  }

  const onFiltersChange = (next: FilterSet) => {
    setFiltersOpen(true)
    setRawFilters(serializeFilters(next) ?? "")
  }

  const onTimeRangeSelect = useCallback((range: { from: string; to: string } | null) => {
    setRawFilters((prev) => {
      const current = parseFilters(prev || undefined)
      const next = { ...current }
      if (range) {
        next.startTime = [
          { op: "gte" as const, value: range.from },
          { op: "lte" as const, value: range.to },
        ]
      } else {
        delete next.startTime
      }
      return serializeFilters(next) ?? ""
    })
  }, [])

  const clearFilters = () => {
    setRawFilters("")
  }

  const closeTraceDrawer = useCallback(() => {
    setActiveTraceId("")
    setSelectedSpanId("")
  }, [setActiveTraceId, setSelectedSpanId])

  const onActiveTraceChange = (traceId: string | undefined) => {
    if (!traceId) {
      closeTraceDrawer()
      return
    }
    setActiveTraceId(traceId)
  }

  const onActiveSessionChange = (_sessionId: string | undefined) => {
    closeTraceDrawer()
  }

  const clearSelections = () => setSelectionState(EMPTY_SELECTION)

  // Compute next/prev trace callbacks from the loaded list
  const navigateTrace = useCallback(
    (delta: 1 | -1) => {
      const ids = traceIdsRef.current
      if (ids.length === 0) return
      const idx = ids.indexOf(activeTraceId)
      const target = idx < 0 ? ids[0] : ids[idx + delta]
      if (target) setActiveTraceId(target)
    },
    [activeTraceId],
  )

  const onNextTrace = useCallback(() => navigateTrace(1), [navigateTrace])
  const onPrevTrace = useCallback(() => navigateTrace(-1), [navigateTrace])
  const activeTraceIndex = traceIdsRef.current.indexOf(activeTraceId)
  const canNavigateNext =
    traceIdsRef.current.length > 0 && (activeTraceIndex < 0 || activeTraceIndex < traceIdsRef.current.length - 1)
  const canNavigatePrev = traceIdsRef.current.length > 0 && (activeTraceIndex < 0 || activeTraceIndex > 0)

  // Page-level hotkeys
  useHotkeys([
    { hotkey: "F", callback: () => setFiltersOpen((prev) => !prev) },
    { hotkey: "1", callback: () => setActiveTab("traces"), options: { enabled: !activeTraceId } },
    { hotkey: "2", callback: () => setActiveTab("sessions"), options: { enabled: !activeTraceId } },
    {
      hotkey: "Escape",
      callback: closeTraceDrawer,
      options: { enabled: !!activeTraceId, ignoreInputs: true },
    },
  ])

  const sharedViewProps = {
    projectId: currentProject.id,
    filters,
    filtersOpen,
    activeTraceId: activeTraceId || undefined,
    activeDrawerTab,
    baselines: cohortSummary?.baselines,
    sorting,
    onSortingChange,
    selectionState,
    onSelectionChange: setSelectionState,
    totalTraceCount,
    onFiltersChange,
    onFiltersClose: () => setFiltersOpen(false),
    onActiveTraceChange,
    traceIdsRef,
  }

  return (
    <Layout>
      <Layout.Actions>
        <Layout.ActionsRow>
          <Layout.ActionRowItem>
            <Button variant="outline" size="sm" disabled>
              <AppWindowIcon className="h-4 w-4" />
              All logs
              <ChevronDown className="h-4 w-4" />
            </Button>
            <TimeFilterDropdown
              {...(timeFrom ? { startTimeFrom: timeFrom } : {})}
              {...(timeTo ? { startTimeTo: timeTo } : {})}
              onChange={(from, to) => {
                const next = { ...filters }
                if (from || to) {
                  const conditions = [
                    ...(from ? [{ op: "gte" as const, value: from }] : []),
                    ...(to ? [{ op: "lte" as const, value: to }] : []),
                  ]
                  next.startTime = conditions
                } else {
                  delete next.startTime
                }
                setRawFilters(serializeFilters(next) ?? "")
              }}
            />
            <ColumnsSelector
              columns={TRACE_COLUMN_OPTIONS}
              selectedColumnIds={visibleTraceColumnIds}
              onChange={(nextColumnIds) =>
                setRawTraceColumns(serializeTraceColumnIds(nextColumnIds as TraceColumnId[]))
              }
              disabled={activeTab !== "traces"}
            />
            <Tooltip
              asChild
              trigger={
                <Button
                  variant={filtersOpen ? "outline" : "ghost"}
                  size="sm"
                  onClick={() => setFiltersOpen(!filtersOpen)}
                >
                  <FilterIcon className="h-4 w-4" />
                  Filters
                  {hasActiveFilters && (
                    <span className="inline-flex items-center justify-center rounded-full bg-primary px-1.5 text-[10px] leading-4 font-medium text-primary-foreground">
                      {Object.keys(filters).length}
                    </span>
                  )}
                </Button>
              }
            >
              Toggle filters <HotkeyBadge hotkey="F" />
            </Tooltip>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear all
              </Button>
            )}
          </Layout.ActionRowItem>
          <Layout.ActionRowItem>
            <Tabs
              variant="bordered"
              size="sm"
              options={[
                {
                  id: "traces",
                  label: "Traces",
                  icon: <TextIcon className="w-4 h-4" />,
                },
                {
                  id: "sessions",
                  label: "Sessions",
                  icon: <MessagesSquareIcon className="w-4 h-4" />,
                },
              ]}
              active={activeTab}
              onSelect={(id) => {
                setActiveTab(id)
              }}
            />
            <div className="relative">
              <Input
                placeholder={activeTab === "sessions" ? "Search sessions" : "Search traces"}
                size="sm"
                className="peer w-60 pl-8"
                disabled
              />
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground peer-disabled:opacity-50" />
            </div>
          </Layout.ActionRowItem>
        </Layout.ActionsRow>
      </Layout.Actions>

      {selectedCount > 0 && (
        <div className="flex items-center gap-2 px-6">
          <Button variant="outline" size="sm" onClick={() => setAddToDatasetOpen(true)}>
            <Icon icon={DatabaseIcon} size="sm" />
            Add to Dataset ({selectedCount})
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddToQueueOpen(true)}>
            <Icon icon={LayersIcon} size="sm" />
            Add to Annotation Queue ({selectedCount})
          </Button>
        </div>
      )}

      <div className="px-6">
        <TraceAggregationsPanel projectId={currentProject.id} filters={filters} onTimeRangeSelect={onTimeRangeSelect} />
      </div>

      {activeTab === "traces" ? (
        <TracesView {...sharedViewProps} visibleColumnIds={visibleTraceColumnIds} />
      ) : (
        <SessionsView {...sharedViewProps} onActiveSessionChange={onActiveSessionChange} />
      )}

      {activeTraceId ? (
        <Layout.Aside>
          <TraceDetailDrawer
            key={activeTraceId}
            traceId={activeTraceId}
            projectId={currentProject.id}
            baselines={cohortSummary?.baselines}
            filters={filters}
            onFiltersChange={onFiltersChange}
            onClose={closeTraceDrawer}
            onNextTrace={onNextTrace}
            onPrevTrace={onPrevTrace}
            canNavigateNext={canNavigateNext}
            canNavigatePrev={canNavigatePrev}
            onTabChange={setActiveDrawerTab}
          />
        </Layout.Aside>
      ) : null}

      {bulkSelection && (
        <>
          <AddToDatasetModal
            open={addToDatasetOpen}
            onOpenChange={setAddToDatasetOpen}
            projectId={currentProject.id}
            selection={bulkSelection}
            selectedCount={selectedCount}
            onSuccess={clearSelections}
          />
          <AddToQueueModal
            open={addToQueueOpen}
            onOpenChange={setAddToQueueOpen}
            projectId={currentProject.id}
            projectSlug={projectSlug}
            selection={bulkSelection}
            selectedCount={selectedCount}
            {...(hasActiveFilters ? { filters } : {})}
            onSuccess={clearSelections}
          />
        </>
      )}
    </Layout>
  )
}
