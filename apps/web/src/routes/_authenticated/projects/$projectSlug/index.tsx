import type { FilterSet } from "@domain/shared"
import { Button, Icon, type InfiniteTableSorting, type SortDirection, Tabs, Tooltip, toast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { createFileRoute } from "@tanstack/react-router"
import { DatabaseIcon, DownloadIcon, FilterIcon, FilterXIcon, MessagesSquareIcon, TextIcon, XIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRegisterCommands } from "../../../../components/command-palette/command-palette-provider.tsx"
import type { PaletteCommand } from "../../../../components/command-palette/types.ts"
import { HotkeyBadge } from "../../../../components/hotkey-badge.tsx"
import { useProjectsCollection } from "../../../../domains/projects/projects.collection.ts"
import { useSavedSearchBySlug } from "../../../../domains/saved-searches/saved-searches.collection.ts"
import type { SavedSearchRecord } from "../../../../domains/saved-searches/saved-searches.functions.ts"
import { withSessionDefaults } from "../../../../domains/sessions/sessions.collection.ts"
import { useTracesCount } from "../../../../domains/traces/traces.collection.ts"
import { enqueueTracesExport } from "../../../../domains/traces/traces.functions.ts"
import { ListingLayout as Layout } from "../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../lib/hooks/useParamState.ts"
import {
  EMPTY_SELECTION,
  getBulkSelection,
  getSelectedCount,
  type SelectionState,
} from "../../../../lib/hooks/useSelectableRows.ts"
import { BreadcrumbText } from "../../-components/breadcrumb-ui.tsx"
import { AddToDatasetModal } from "./-components/add-to-dataset-modal.tsx"
import { TraceAggregationsPanel } from "./-components/aggregations/aggregations-panel.tsx"
import { ColumnsSelector } from "./-components/columns-selector.tsx"
import { ExportConfirmationModal } from "./-components/export-confirmation-modal.tsx"
import { TRACE_COLUMN_OPTIONS, type TraceColumnId } from "./-components/project-traces-table.tsx"
import { SaveOrUpdateSearchButton } from "./-components/save-or-update-search-button.tsx"
import { SaveSearchModal } from "./-components/save-search-modal.tsx"
import { SavedSearchSelector } from "./-components/saved-search-selector.tsx"
import { SearchInput } from "./-components/search-input.tsx"
import { SessionDetailDrawer } from "./-components/session-detail-drawer.tsx"
import {
  DEFAULT_SESSION_SORTING,
  getSessionColumnOptions,
  type SessionColumnId,
  SessionsView,
} from "./-components/sessions-view.tsx"
import { useTableColumnSettings } from "./-components/table-column-settings.ts"
import { TimeFilterDropdown } from "./-components/time-filter-dropdown.tsx"
import { TraceDetailDrawer } from "./-components/trace-detail-drawer.tsx"
import {
  DEFAULT_TRACE_SORTING,
  getTimeFilterValue,
  parseFilters,
  serializeFilters,
} from "./-components/trace-page-state.ts"
import { TracesEmptyOnboarding } from "./-components/traces-empty-onboarding.tsx"
import { TracesEmptyState } from "./-components/traces-empty-state.tsx"
import { TracesView } from "./-components/traces-view.tsx"
import { useRouteProject } from "./-route-data.ts"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/")({
  staticData: {
    breadcrumb: () => <BreadcrumbText variant="current">Traces</BreadcrumbText>,
  },
  component: ProjectPage,
})

function ProjectPage() {
  const { projectSlug } = Route.useParams()
  const routeProject = useRouteProject()
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )
  const { data: allProjects = [] } = useProjectsCollection()
  const currentProject = project ?? routeProject
  const [activeTab, setActiveTab] = useParamState("tab", "sessions", {
    validate: (v): v is "traces" | "sessions" => v === "traces" || v === "sessions",
  })
  const [filtersOpen, setFiltersOpen] = useParamState("filtersOpen", false)
  const [activeTraceId, setActiveTraceId] = useParamState("traceId", "")
  const [activeSessionId, setActiveSessionId] = useParamState("sessionId", "")
  const [, setSelectedSpanId] = useParamState("spanId", "")
  const [rawFilters, setRawFilters] = useParamState("filters", "")
  const [query, setQuery] = useParamState("query", "")
  const [savedSearchSlug, setSavedSearchSlug] = useParamState("savedSearch", "")
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const hasSearchQuery = query.length > 0
  const { data: loadedSavedSearch } = useSavedSearchBySlug(currentProject.id, savedSearchSlug || null)

  // Hydrate a slug-only `?savedSearch=` deep-link (the monitor incidents table and the command
  // palette can't carry the filter state) with the saved search's query + filters, once per slug.
  // We materialize into the URL — rather than deriving during render — so edit / drift / clear
  // semantics read off the URL like every other entry path; a link that already carries
  // query/filters (the dropdown selection) is left untouched.
  // TODO(frontend-use-effect-policy): syncing async-loaded server data into URL state can't run
  // during render (navigation is a side effect) and the record isn't available at mount.
  const hydratedSavedSearchSlugRef = useRef<string | null>(null)
  useEffect(() => {
    if (!loadedSavedSearch) return
    if (hydratedSavedSearchSlugRef.current === loadedSavedSearch.slug) return
    hydratedSavedSearchSlugRef.current = loadedSavedSearch.slug
    if (query.length > 0 || rawFilters.length > 0) return
    if (loadedSavedSearch.query) setQuery(loadedSavedSearch.query)
    const serialized = serializeFilters(loadedSavedSearch.filterSet)
    if (serialized) setRawFilters(serialized)
  }, [loadedSavedSearch, query, rawFilters, setQuery, setRawFilters])

  // Contribute page-level Traces actions (tab switch + filters) to the command palette.
  const paletteCommands = useMemo<readonly PaletteCommand[]>(() => {
    const commands: PaletteCommand[] = []
    if (activeTab !== "sessions") {
      commands.push({
        id: "traces:view-sessions",
        title: "View sessions",
        icon: MessagesSquareIcon,
        section: "context",
        group: "Traces",
        keywords: "sessions tab switch",
        perform: () => setActiveTab("sessions"),
      })
    }
    if (activeTab !== "traces") {
      commands.push({
        id: "traces:view-traces",
        title: "View traces",
        icon: TextIcon,
        section: "context",
        group: "Traces",
        keywords: "traces tab switch",
        perform: () => setActiveTab("traces"),
      })
    }
    commands.push({
      id: "traces:toggle-filters",
      title: filtersOpen ? "Hide filters" : "Show filters",
      icon: FilterIcon,
      section: "context",
      group: "Traces",
      keywords: "filters toggle show hide panel",
      perform: () => setFiltersOpen(!filtersOpen),
    })
    if (rawFilters.length > 0) {
      commands.push({
        id: "traces:clear-filters",
        title: "Clear filters",
        icon: FilterXIcon,
        section: "context",
        group: "Traces",
        keywords: "clear reset remove filters",
        perform: () => setRawFilters(""),
      })
    }
    return commands
  }, [activeTab, filtersOpen, rawFilters, setActiveTab, setFiltersOpen, setRawFilters])

  useRegisterCommands(paletteCommands)

  const tabDefaultSorting = activeTab === "sessions" ? DEFAULT_SESSION_SORTING : DEFAULT_TRACE_SORTING
  const [sortBy, setSortBy] = useParamState("sortBy", tabDefaultSorting.column)
  const [sortDirection, setSortDirection] = useParamState("sortDirection", tabDefaultSorting.direction, {
    validate: (v): v is SortDirection => v === "asc" || v === "desc",
  })
  const [traceDetailTab] = useParamState("detailTab", "trace", {
    validate: (v): v is "trace" | "conversation" | "spans" | "annotations" =>
      v === "trace" || v === "conversation" || v === "spans" || v === "annotations",
  })

  // Ref to the ordered list of trace IDs from the currently loaded table page
  const traceIdsRef = useRef<string[]>([])

  const filters = useMemo(() => parseFilters(rawFilters || undefined), [rawFilters])
  // The Sessions tab's hooks (useSessionsInfiniteScroll / useSessionsCount)
  // apply `withSessionDefaults` internally to hide orphan-fragment sessions
  // by default. The trace-side surfaces here (count, export, add-to-dataset)
  // need the same default applied on that tab so a Select-All export doesn't
  // sweep traces the user never saw. On the Traces tab `hasLlmActivity` is
  // a session-only synthetic and isn't part of the trace filter registry,
  // so we keep the raw filter set there.
  const effectiveFilters = useMemo(
    () => (activeTab === "sessions" ? withSessionDefaults(filters) : filters),
    [filters, activeTab],
  )
  const traceColumnSettings = useTableColumnSettings<TraceColumnId>({
    storageKey: "projects.traces.columns.v1",
    columns: TRACE_COLUMN_OPTIONS,
  })
  const sessionColumnSettings = useTableColumnSettings<SessionColumnId>({
    // v3: renamed the `startTime` column to `lastActivity` (now backed by
    // `max_start_time` for "most recently active" ordering). Bumped so v2
    // layouts don't drop the unknown `startTime` id and stick `lastActivity`
    // at the end — they pick up the new default order instead.
    storageKey: "projects.sessions.columns.v3",
    columns: getSessionColumnOptions(hasSearchQuery),
  })
  const hasActiveFilters = Object.keys(filters).length > 0
  const timeFrom = getTimeFilterValue(filters, "gte")
  const timeTo = getTimeFilterValue(filters, "lte")
  const sorting: InfiniteTableSorting = { column: sortBy, direction: sortDirection }

  const [selectionState, setSelectionState] = useState<SelectionState<string>>(EMPTY_SELECTION)
  const [addToDatasetOpen, setAddToDatasetOpen] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { totalCount: totalTraceCount, isLoading: isTracesCountLoading } = useTracesCount({
    projectId: currentProject.id,
    filters: effectiveFilters,
    ...(hasSearchQuery ? { searchQuery: query } : {}),
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

  // "Clear all" resets the whole search bar: filters, query, and the selected saved search.
  const clearAll = () => {
    setRawFilters("")
    setQuery("")
    setSavedSearchSlug("")
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

  // Sessions tab: clicking a session row opens the session detail panel. A
  // trace reference (currently only via deep link) also sets `traceId` so the
  // panel slides straight into that trace's slot.
  const onOpenSession = useCallback(
    (sessionId: string, traceId?: string) => {
      setActiveSessionId(sessionId)
      setActiveTraceId(traceId ?? "")
    },
    [setActiveSessionId, setActiveTraceId],
  )

  const closeSessionPanel = useCallback(() => {
    setActiveSessionId("")
    setActiveTraceId("")
    setSelectedSpanId("")
  }, [setActiveSessionId, setActiveTraceId, setSelectedSpanId])

  // Submitting a new query invalidates any open drawer context against the new result set.
  // The `savedSearch` slug is intentionally kept so the Save button can surface drift.
  const handleSubmitQuery = useCallback(
    (next: string) => {
      if (next !== query) closeSessionPanel()
      setQuery(next)
    },
    [query, setQuery, closeSessionPanel],
  )

  // Selecting a saved search snaps the active query + filters to the stored state.
  const applySavedSearch = useCallback(
    (record: SavedSearchRecord) => {
      setSavedSearchSlug(record.slug)
      setQuery(record.query ?? "")
      setRawFilters(serializeFilters(record.filterSet) ?? "")
      closeSessionPanel()
    },
    [setSavedSearchSlug, setQuery, setRawFilters, closeSessionPanel],
  )

  const clearSelections = () => setSelectionState(EMPTY_SELECTION)

  const handleExportTraces = useCallback(async () => {
    if (!bulkSelection) return

    setExporting(true)
    try {
      await enqueueTracesExport({
        data: {
          projectId: currentProject.id,
          selection: bulkSelection,
          filters: effectiveFilters,
          ...(hasSearchQuery ? { searchQuery: query } : {}),
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
  }, [bulkSelection, clearSelections, currentProject.id, effectiveFilters, hasSearchQuery, query])

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

  // Page-level hotkeys. Tab switching is disabled while either drawer is open;
  // the trace-drawer Esc only applies on the Traces tab (the session panel owns
  // Esc on the Sessions tab).
  useHotkeys([
    { hotkey: "F", callback: () => setFiltersOpen((prev) => !prev) },
    { hotkey: "1", callback: () => setActiveTab("sessions"), options: { enabled: !activeTraceId && !activeSessionId } },
    { hotkey: "2", callback: () => setActiveTab("traces"), options: { enabled: !activeTraceId && !activeSessionId } },
    {
      hotkey: "Escape",
      callback: closeTraceDrawer,
      options: { enabled: !!activeTraceId && !activeSessionId, ignoreInputs: true, conflictBehavior: "allow" },
    },
  ])

  const hasNoTraces = totalTraceCount === 0 && !hasActiveFilters && !hasSearchQuery
  // `firstTraceAt` is the canonical "this project has ever received a trace"
  // signal (set once by the checkFirstTrace worker). A null value means the
  // project is genuinely unconnected — distinct from a connected project whose
  // traces aged out, or an empty filtered result.
  const isConnected = currentProject.firstTraceAt != null
  const orgHasConnectedProjects = allProjects.some((p) => p.id !== currentProject.id && p.firstTraceAt != null)

  if (isTracesCountLoading && !hasActiveFilters && !hasSearchQuery) {
    return (
      <Layout>
        <TracesEmptyState isLoading />
      </Layout>
    )
  }

  // Never connected + nothing to show → onboarding-style connect experience.
  if (!isConnected && hasNoTraces) {
    return (
      <Layout>
        <TracesEmptyOnboarding project={currentProject} orgHasConnectedProjects={orgHasConnectedProjects} />
      </Layout>
    )
  }

  // Connected before, but currently empty (e.g. retention) → minimal placeholder.
  if (isConnected && hasNoTraces) {
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
            <Tooltip
              asChild
              trigger={
                <Button
                  variant={filtersOpen ? "outline" : "ghost"}
                  size="default"
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
            {(hasActiveFilters || hasSearchQuery) && (
              <Button variant="ghost" size="sm" onClick={clearAll}>
                <Icon icon={XIcon} size="sm" />
                Clear all
              </Button>
            )}
          </Layout.ActionRowItem>
          <Layout.ActionRowItem>
            {activeTab === "sessions" ? (
              <ColumnsSelector
                columns={sessionColumnSettings.columns}
                selectedColumnIds={sessionColumnSettings.visibleColumnIds}
                onChange={(nextColumnIds) =>
                  sessionColumnSettings.setVisibleColumnIds(nextColumnIds as SessionColumnId[])
                }
                onOrderChange={(nextColumnIds) =>
                  sessionColumnSettings.setColumnIds(nextColumnIds as SessionColumnId[])
                }
              />
            ) : (
              <ColumnsSelector
                columns={traceColumnSettings.columns}
                selectedColumnIds={traceColumnSettings.visibleColumnIds}
                onChange={(nextColumnIds) => traceColumnSettings.setVisibleColumnIds(nextColumnIds as TraceColumnId[])}
                onOrderChange={(nextColumnIds) => traceColumnSettings.setColumnIds(nextColumnIds as TraceColumnId[])}
              />
            )}
            <Tabs
              variant="bordered"
              size="sm"
              options={[
                {
                  id: "sessions",
                  label: "Sessions",
                  icon: <MessagesSquareIcon className="w-4 h-4" />,
                },
                {
                  id: "traces",
                  label: "Traces",
                  icon: <TextIcon className="w-4 h-4" />,
                },
              ]}
              active={activeTab}
              onSelect={(id) => {
                setActiveTab(id)
              }}
            />
          </Layout.ActionRowItem>
        </Layout.ActionsRow>
        <Layout.ActionsRow className="justify-stretch">
          <div className="flex w-full items-center gap-2">
            {/* Dropdown + input read as one control: a single rounded-lg border wraps both,
                with the dropdown flush on the left (square divider, no inner rounding). */}
            <div className="group/searchbar flex h-8 min-w-0 flex-1 items-center overflow-hidden rounded-lg border border-input transition-colors focus-within:ring-1 focus-within:ring-ring">
              <SavedSearchSelector
                projectId={currentProject.id}
                projectSlug={projectSlug}
                selectedSlug={savedSearchSlug}
                onSelect={applySavedSearch}
                onSelectedSlugChange={setSavedSearchSlug}
                onSaveCurrent={() => setSaveModalOpen(true)}
                canSaveCurrent={hasSearchQuery || hasActiveFilters}
              />
              <SearchInput key={query} initialValue={query} onSubmit={handleSubmitQuery} />
            </div>
            <SaveOrUpdateSearchButton
              projectId={currentProject.id}
              query={query}
              filters={filters}
              loadedSavedSearch={loadedSavedSearch}
              onRequestSave={() => setSaveModalOpen(true)}
            />
          </div>
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
        </div>
      )}

      <div className="px-6">
        <TraceAggregationsPanel
          projectId={currentProject.id}
          projectSlug={currentProject.slug}
          filters={filters}
          mode={activeTab}
          onTimeRangeSelect={onTimeRangeSelect}
        />
      </div>

      {activeTab === "traces" ? (
        <TracesView
          {...sharedViewProps}
          visibleColumnIds={traceColumnSettings.visibleColumnIds}
          {...(hasSearchQuery ? { searchQuery: query } : {})}
        />
      ) : (
        <SessionsView
          projectId={currentProject.id}
          filters={filters}
          filtersOpen={filtersOpen}
          activeSessionId={activeSessionId || undefined}
          activeTraceId={activeTraceId || undefined}
          sorting={sorting}
          onSortingChange={onSortingChange}
          selectionState={selectionState}
          onSelectionChange={setSelectionState}
          totalTraceCount={totalTraceCount}
          onFiltersChange={onFiltersChange}
          onFiltersClose={() => setFiltersOpen(false)}
          onOpenSession={onOpenSession}
          onCloseSession={closeSessionPanel}
          visibleColumnIds={sessionColumnSettings.visibleColumnIds}
          isSearching={hasSearchQuery}
          {...(hasSearchQuery ? { searchQuery: query } : {})}
        />
      )}

      {activeTab === "traces" && activeTraceId ? (
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
            {...(hasSearchQuery ? { searchQuery: query } : {})}
          />
        </Layout.Aside>
      ) : null}

      {activeTab === "sessions" && activeSessionId ? (
        <Layout.Aside>
          <SessionDetailDrawer
            key={activeSessionId}
            projectId={currentProject.id}
            sessionId={activeSessionId}
            onClose={closeSessionPanel}
            filters={filters}
            onFiltersChange={onFiltersChange}
            {...(hasSearchQuery ? { searchQuery: query } : {})}
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
            filters={effectiveFilters}
            {...(hasSearchQuery ? { searchQuery: query } : {})}
          />
        </>
      )}

      {saveModalOpen ? (
        <SaveSearchModal
          mode="create"
          open={saveModalOpen}
          onClose={() => setSaveModalOpen(false)}
          projectId={currentProject.id}
          query={query || null}
          filterSet={filters}
          onCreated={(record) => {
            setSavedSearchSlug(record.slug)
            setSaveModalOpen(false)
          }}
        />
      ) : null}
    </Layout>
  )
}
