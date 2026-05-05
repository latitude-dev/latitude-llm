import type { FilterSet } from "@domain/shared"
import { Button, Icon, Input, type SortDirection, SplitButton, Tooltip, toast } from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { ArrowLeftIcon, DatabaseIcon, DownloadIcon, FilterIcon, PinIcon, SearchIcon } from "lucide-react"
import { useRef, useState } from "react"
import {
  useSavedSearchBySlug,
  useUpdateSavedSearch,
} from "../../../../../domains/saved-searches/saved-searches.collection.ts"
import { useTracesCount } from "../../../../../domains/traces/traces.collection.ts"
import { enqueueTracesExport } from "../../../../../domains/traces/traces.functions.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { EMPTY_SELECTION, type SelectionState } from "../../../../../lib/hooks/useSelectableRows.ts"
import { ColumnsSelector } from "../-components/columns-selector.tsx"
import { ExportConfirmationModal } from "../-components/export-confirmation-modal.tsx"
import { TRACE_COLUMN_OPTIONS, type TraceColumnId } from "../-components/project-traces-table.tsx"
import { useTableColumnSettings } from "../-components/table-column-settings.ts"
import { TimeFilterDropdown } from "../-components/time-filter-dropdown.tsx"
import { TraceDetailDrawer } from "../-components/trace-detail-drawer.tsx"
import {
  DEFAULT_TRACE_SORTING,
  getBulkSelection,
  getSelectedCount,
  getTimeFilterValue,
  parseFilters,
  serializeFilters,
} from "../-components/trace-page-state.ts"
import { TracesView } from "../-components/traces-view.tsx"
import { useRouteProject } from "../-route-data.ts"
import { AddToDatasetModal } from "../datasets/-components/add-to-dataset-modal.tsx"
import { SaveSearchModal } from "./-components/save-search-modal.tsx"
import { SavedSearchesList } from "./-components/saved-searches-list.tsx"

const SEARCH_QUERY_MAX_LENGTH = 500

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/search/")({
  component: SearchPage,
})

function SearchPage() {
  const { projectSlug } = Route.useParams()
  const project = useRouteProject()
  const projectId = project.id
  const router = useRouter()

  const [q, setQ] = useParamState("q", "")
  const [savedSearchSlug] = useParamState("savedSearch", "")

  // Results state — kept at the top level so the layout slots below
  // (`Layout.Actions`, `Layout.Aside`, …) remain DIRECT children of `<Layout>`.
  // `ListingLayout` discovers its panes via `Children.toArray`, which doesn't
  // see through function components.
  const [filtersOpen, setFiltersOpen] = useParamState("filtersOpen", false)
  const [activeTraceId, setActiveTraceId] = useParamState("traceId", "")
  const [, setSelectedSpanId] = useParamState("spanId", "")
  const [rawFilters, setRawFilters] = useParamState("filters", "")
  const [sortBy, setSortBy] = useParamState("sortBy", DEFAULT_TRACE_SORTING.column)
  const [sortDirection, setSortDirection] = useParamState("sortDirection", DEFAULT_TRACE_SORTING.direction, {
    validate: (v): v is SortDirection => v === "asc" || v === "desc",
  })
  const [traceDetailTab, setTraceDetailTab] = useParamState("traceDetailTab", "trace", {
    validate: (v): v is "trace" | "conversation" | "spans" | "annotations" =>
      v === "trace" || v === "conversation" || v === "spans" || v === "annotations",
  })

  const traceIdsRef = useRef<string[]>([])

  const filters = parseFilters(rawFilters || undefined)
  const traceColumnSettings = useTableColumnSettings<TraceColumnId>({
    storageKey: "projects.search.traces.columns.v1",
    columns: TRACE_COLUMN_OPTIONS,
  })
  const hasSearchQuery = q.length > 0
  const hasActiveFilters = Object.keys(filters).length > 0
  const hasContent = hasSearchQuery || hasActiveFilters
  const timeFrom = getTimeFilterValue(filters, "gte")
  const timeTo = getTimeFilterValue(filters, "lte")
  const sorting = { column: sortBy, direction: sortDirection } as const

  const [selectionState, setSelectionState] = useState<SelectionState<string>>(EMPTY_SELECTION)
  const [addToDatasetOpen, setAddToDatasetOpen] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)

  const { data: loadedSavedSearch } = useSavedSearchBySlug(projectId, savedSearchSlug || null)
  const updateSavedSearchMutation = useUpdateSavedSearch(projectId)

  // Compare canonical serializations of both filter sets. `rawFilters` is whatever TanStack Router
  // wrote to the URL (potentially JSON-stringified twice depending on encoding), so going through
  // `serializeFilters` on both sides — after `parseFilters` already normalized `filters` — is the
  // only way to get a stable match when the saved search hasn't been touched.
  const hasDrift = loadedSavedSearch
    ? (loadedSavedSearch.query ?? "") !== q ||
      (serializeFilters(loadedSavedSearch.filterSet) ?? "") !== (serializeFilters(filters) ?? "")
    : false

  const { totalCount: totalTraceCount } = useTracesCount({
    projectId: hasContent ? projectId : "",
    ...(hasActiveFilters ? { filters } : {}),
    searchQuery: q,
  })

  const selectedCount = getSelectedCount(selectionState, totalTraceCount)
  const bulkSelection = getBulkSelection(selectionState)
  // Bulk actions only render for explicitly-picked rows. `mode: "all"` and
  // `mode: "allExcept"` would resolve server-side against the unfiltered
  // project, ignoring `searchQuery`, which would silently process more
  // traces than the user sees in the UI.
  const showBulkActions = bulkSelection?.mode === "selected"

  const onSortingChange = (next: { column: string; direction: SortDirection }) => {
    setSortBy(next.column)
    setSortDirection(next.direction)
  }

  const onFiltersChange = (next: FilterSet) => {
    setFiltersOpen(true)
    setRawFilters(serializeFilters(next) ?? "")
  }

  const clearFilters = () => {
    setRawFilters("")
  }

  const closeTraceDrawer = () => {
    setActiveTraceId("")
    setSelectedSpanId("")
    setTraceDetailTab("trace")
  }

  const onActiveTraceChange = (traceId: string | undefined) => {
    if (!traceId) {
      closeTraceDrawer()
      return
    }
    setActiveTraceId(traceId)
  }

  const clearSelections = () => setSelectionState(EMPTY_SELECTION)

  const handleExportTraces = async () => {
    if (!bulkSelection) return

    setExporting(true)
    try {
      await enqueueTracesExport({
        data: {
          projectId,
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
  }

  const navigateTrace = (delta: 1 | -1) => {
    const ids = traceIdsRef.current
    if (ids.length === 0) return
    const idx = ids.indexOf(activeTraceId)
    const target = idx < 0 ? ids[0] : ids[idx + delta]
    if (target) setActiveTraceId(target)
  }

  const activeTraceIndex = traceIdsRef.current.indexOf(activeTraceId)
  const canNavigateNext =
    traceIdsRef.current.length > 0 && (activeTraceIndex < 0 || activeTraceIndex < traceIdsRef.current.length - 1)
  const canNavigatePrev = traceIdsRef.current.length > 0 && (activeTraceIndex < 0 || activeTraceIndex > 0)

  useHotkeys([
    { hotkey: "F", callback: () => setFiltersOpen((prev) => !prev), options: { enabled: hasContent } },
    {
      hotkey: "Escape",
      callback: closeTraceDrawer,
      options: { enabled: !!activeTraceId, ignoreInputs: true },
    },
  ])

  return (
    <Layout>
      <Layout.Actions>
        <Layout.ActionsRow className="justify-stretch">
          <div className="relative flex w-full items-center gap-2">
            {hasContent ? (
              <Tooltip
                asChild
                trigger={
                  <Button asChild variant="ghost" size="icon">
                    <Link to="/projects/$projectSlug/search" params={{ projectSlug }} aria-label="Clear search">
                      <Icon icon={ArrowLeftIcon} size="sm" />
                    </Link>
                  </Button>
                }
              >
                Clear search
              </Tooltip>
            ) : null}
            <SearchInput key={q} initialValue={q} onSubmit={setQ} />
          </div>
        </Layout.ActionsRow>
      </Layout.Actions>

      {!hasContent ? <SavedSearchesList projectId={projectId} projectSlug={projectSlug} /> : null}

      {hasContent ? (
        <Layout.Actions className="pt-0">
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
              <Button
                variant={filtersOpen ? "outline" : "ghost"}
                size="sm"
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <Icon icon={FilterIcon} size="sm" />
                Filters
                {hasActiveFilters ? (
                  <span className="inline-flex items-center justify-center rounded-full bg-primary px-1.5 text-[10px] leading-4 font-medium text-primary-foreground">
                    {Object.keys(filters).length}
                  </span>
                ) : null}
              </Button>
              {hasActiveFilters ? (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear all
                </Button>
              ) : null}
            </Layout.ActionRowItem>
            <Layout.ActionRowItem>
              <ColumnsSelector
                columns={traceColumnSettings.columns}
                selectedColumnIds={traceColumnSettings.visibleColumnIds}
                onChange={(nextColumnIds) => traceColumnSettings.setVisibleColumnIds(nextColumnIds as TraceColumnId[])}
                onOrderChange={(nextColumnIds) => traceColumnSettings.setColumnIds(nextColumnIds as TraceColumnId[])}
              />
              {loadedSavedSearch ? (
                <SplitButton
                  variant="outline"
                  size="sm"
                  disabled={!hasDrift}
                  isLoading={updateSavedSearchMutation.isPending}
                  actions={[
                    {
                      content: "Update Saved Search",
                      onClick: () =>
                        updateSavedSearchMutation.mutate(
                          {
                            id: loadedSavedSearch.id,
                            query: q || null,
                            filterSet: filters,
                          },
                          {
                            onSuccess: () => toast({ title: "Saved search updated" }),
                            onError: (error) =>
                              toast({
                                variant: "destructive",
                                title: "Could not save changes",
                                description: toUserMessage(error),
                              }),
                          },
                        ),
                    },
                    {
                      content: "Save as new Search",
                      onClick: () => setSaveModalOpen(true),
                    },
                  ]}
                />
              ) : (
                <Button variant="outline" size="sm" onClick={() => setSaveModalOpen(true)}>
                  <Icon icon={PinIcon} size="sm" />
                  Save search
                </Button>
              )}
            </Layout.ActionRowItem>
          </Layout.ActionsRow>
        </Layout.Actions>
      ) : null}

      {hasContent && showBulkActions ? (
        <div className="flex flex-row items-center gap-2 px-6">
          <Button variant="outline" size="sm" onClick={() => setExportModalOpen(true)} disabled={exporting}>
            <Icon icon={DownloadIcon} size="sm" />
            Export Traces ({selectedCount.toLocaleString()})
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddToDatasetOpen(true)}>
            <Icon icon={DatabaseIcon} size="sm" />
            Add to Dataset ({selectedCount})
          </Button>
        </div>
      ) : null}

      {hasContent ? (
        <TracesView
          projectId={projectId}
          filters={filters}
          filtersOpen={filtersOpen}
          activeTraceId={activeTraceId || undefined}
          activeDrawerTab={traceDetailTab}
          sorting={sorting}
          onSortingChange={onSortingChange}
          selectionState={selectionState}
          onSelectionChange={setSelectionState}
          totalTraceCount={totalTraceCount}
          onFiltersChange={onFiltersChange}
          onFiltersClose={() => setFiltersOpen(false)}
          onActiveTraceChange={onActiveTraceChange}
          traceIdsRef={traceIdsRef}
          visibleColumnIds={traceColumnSettings.visibleColumnIds}
          searchQuery={q}
        />
      ) : null}

      {hasContent && activeTraceId ? (
        <Layout.Aside>
          <TraceDetailDrawer
            key={activeTraceId}
            traceId={activeTraceId}
            projectId={projectId}
            filters={filters}
            onFiltersChange={onFiltersChange}
            onClose={closeTraceDrawer}
            onNextTrace={() => navigateTrace(1)}
            onPrevTrace={() => navigateTrace(-1)}
            canNavigateNext={canNavigateNext}
            canNavigatePrev={canNavigatePrev}
          />
        </Layout.Aside>
      ) : null}

      {hasContent && showBulkActions && bulkSelection ? (
        <ExportConfirmationModal
          open={exportModalOpen}
          onOpenChange={setExportModalOpen}
          itemLabel="trace"
          selectedCount={selectedCount}
          onConfirm={() => void handleExportTraces()}
          exporting={exporting}
        />
      ) : null}

      {hasContent && showBulkActions && bulkSelection ? (
        <AddToDatasetModal
          open={addToDatasetOpen}
          onOpenChange={setAddToDatasetOpen}
          projectId={projectId}
          selection={bulkSelection}
          selectedCount={selectedCount}
          onSuccess={clearSelections}
        />
      ) : null}

      {saveModalOpen ? (
        <SaveSearchModal
          mode="create"
          open={saveModalOpen}
          onClose={() => setSaveModalOpen(false)}
          projectId={projectId}
          query={q || null}
          filterSet={filters}
          onCreated={() => {
            void router.navigate({
              to: "/projects/$projectSlug/search",
              params: { projectSlug },
              search: () => ({}),
            })
          }}
        />
      ) : null}
    </Layout>
  )
}

function SearchInput({
  initialValue,
  onSubmit,
}: {
  readonly initialValue: string
  readonly onSubmit: (value: string) => void
}) {
  const [draft, setDraft] = useState(initialValue)

  return (
    <div className="relative flex-1">
      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
        <Icon icon={SearchIcon} size="sm" color="foregroundMuted" />
      </div>
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return
          event.preventDefault()
          const next = draft.trim().slice(0, SEARCH_QUERY_MAX_LENGTH)
          onSubmit(next)
        }}
        placeholder="Search"
        size="lg"
        maxLength={SEARCH_QUERY_MAX_LENGTH}
        className="w-full pl-9 rounded-xl"
        autoFocus
      />
    </div>
  )
}
