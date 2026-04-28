import type { FilterSet } from "@domain/shared"
import { Button, Icon, type InfiniteTableSorting, type SortDirection, Tabs, Tooltip, toast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { createFileRoute } from "@tanstack/react-router"
import { DatabaseIcon, DownloadIcon, FilterIcon, LayersIcon, MessagesSquareIcon, TextIcon } from "lucide-react"
import { useCallback, useMemo, useRef, useState } from "react"
import { HotkeyBadge } from "../../../../components/hotkey-badge.tsx"
import { useProjectsCollection } from "../../../../domains/projects/projects.collection.ts"
import { useTracesCount } from "../../../../domains/traces/traces.collection.ts"
import { enqueueTracesExport } from "../../../../domains/traces/traces.functions.ts"
import { ListingLayout as Layout } from "../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../lib/hooks/useParamState.ts"
import { EMPTY_SELECTION, type SelectionState } from "../../../../lib/hooks/useSelectableRows.ts"
import { TraceAggregationsPanel } from "./-components/aggregations/aggregations-panel.tsx"
import { ColumnsSelector } from "./-components/columns-selector.tsx"
import { ExportConfirmationModal } from "./-components/export-confirmation-modal.tsx"
import { TRACE_COLUMN_OPTIONS, type TraceColumnId } from "./-components/project-traces-table.tsx"
import { SessionsView } from "./-components/sessions-view.tsx"
import { TimeFilterDropdown } from "./-components/time-filter-dropdown.tsx"
import { TraceDetailDrawer } from "./-components/trace-detail-drawer.tsx"
import {
  DEFAULT_TRACE_COLUMNS,
  DEFAULT_TRACE_SORTING,
  getBulkSelection,
  getSelectedCount,
  getTimeFilterValue,
  parseFilters,
  parseTraceColumnIds,
  serializeFilters,
  serializeTraceColumnIds,
} from "./-components/trace-page-state.ts"
import { TracesEmptyState } from "./-components/traces-empty-state.tsx"
import { TracesView } from "./-components/traces-view.tsx"
import { useRouteProject } from "./-route-data.ts"
import { AddToQueueModal } from "./annotation-queues/-components/add-to-queue-modal.tsx"
import { AddToDatasetModal } from "./datasets/-components/add-to-dataset-modal.tsx"

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

  const [traceDetailTab, setTraceDetailTab] = useParamState("traceDetailTab", "trace", {
    validate: (v): v is "trace" | "conversation" | "spans" | "annotations" =>
      v === "trace" || v === "conversation" || v === "spans" || v === "annotations",
  })

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
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { totalCount: totalTraceCount, isLoading: isTracesCountLoading } = useTracesCount({
    projectId: currentProject.id,
    ...(hasActiveFilters ? { filters } : {}),
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
    setTraceDetailTab("trace")
  }, [setActiveTraceId, setSelectedSpanId, setTraceDetailTab])

  const onActiveTraceChange = (traceId: string | undefined) => {
    if (!traceId) {
      closeTraceDrawer()
      return
    }
    setActiveTraceId(traceId)
  }

  const clearSelections = () => setSelectionState(EMPTY_SELECTION)

  const handleExportTraces = useCallback(async () => {
    if (!bulkSelection) return

    setExporting(true)
    try {
      await enqueueTracesExport({
        data: {
          projectId: currentProject.id,
          selection: bulkSelection,
          ...(hasActiveFilters ? { filters } : {}),
        },
      })
      toast({
        title: "Export started",
        description: "You'll receive an email with a download link when your export is ready.",
      })
      clearSelections()
      setExportModalOpen(false)
    } catch (error) {
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Export failed",
      })
    } finally {
      setExporting(false)
    }
  }, [bulkSelection, clearSelections, currentProject.id, filters, hasActiveFilters])

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

  const hasNoTraces = totalTraceCount === 0 && !hasActiveFilters
  const showEmptyState = !isTracesCountLoading && hasNoTraces

  if (isTracesCountLoading && hasNoTraces) {
    return null
  }

  if (showEmptyState) {
    return (
      <Layout>
        <TracesEmptyState />
      </Layout>
    )
  }

  const sharedViewProps = {
    projectId: currentProject.id,
    filters,
    filtersOpen,
    activeTraceId: activeTraceId || undefined,
    activeDrawerTab: traceDetailTab,
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
          </Layout.ActionRowItem>
        </Layout.ActionsRow>
      </Layout.Actions>

      {selectedCount > 0 && (
        <div className="flex items-center gap-2 px-6">
          <Button variant="outline" size="sm" onClick={() => setExportModalOpen(true)} disabled={exporting}>
            <Icon icon={DownloadIcon} size="sm" />
            Export Traces ({selectedCount.toLocaleString()})
          </Button>
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
        <SessionsView {...sharedViewProps} />
      )}

      {activeTraceId ? (
        <Layout.Aside>
          <TraceDetailDrawer
            key={activeTraceId}
            traceId={activeTraceId}
            projectId={currentProject.id}
            filters={filters}
            onFiltersChange={onFiltersChange}
            onClose={closeTraceDrawer}
            onNextTrace={onNextTrace}
            onPrevTrace={onPrevTrace}
            canNavigateNext={canNavigateNext}
            canNavigatePrev={canNavigatePrev}
          />
        </Layout.Aside>
      ) : null}

      {bulkSelection && (
        <>
          <ExportConfirmationModal
            open={exportModalOpen}
            onOpenChange={setExportModalOpen}
            itemLabel="trace"
            selectedCount={selectedCount}
            onConfirm={() => void handleExportTraces()}
            exporting={exporting}
          />
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
