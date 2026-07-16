import type { MonitorTarget } from "@domain/monitors"
import type { FilterSet } from "@domain/shared"
import { stripCustomBehaviorExcludedFields } from "@domain/taxonomy"
import { Button, Icon, type InfiniteTableSorting, type SortDirection, Tabs, Tooltip, toast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { useNavigate } from "@tanstack/react-router"
import {
  BellPlusIcon,
  DatabaseIcon,
  DownloadIcon,
  FilterIcon,
  FilterXIcon,
  MessagesSquareIcon,
  ShieldAlertIcon,
  SlidersHorizontalIcon,
  TextIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRegisterCommands } from "../../../../../components/command-palette/command-palette-provider.tsx"
import type { PaletteCommand } from "../../../../../components/command-palette/types.ts"
import { HotkeyBadge } from "../../../../../components/hotkey-badge.tsx"
import {
  addTracesToDatasetFunction,
  createDatasetFromTracesFunction,
} from "../../../../../domains/datasets/datasets.functions.ts"
import { useFeatureFlags } from "../../../../../domains/feature-flags/feature-flags.collection.ts"
import { useMonitors } from "../../../../../domains/monitors/monitors.collection.ts"
import { useProjectsCollection } from "../../../../../domains/projects/projects.collection.ts"
import { useSavedSearchBySlug } from "../../../../../domains/saved-searches/saved-searches.collection.ts"
import type { SavedSearchRecord } from "../../../../../domains/saved-searches/saved-searches.functions.ts"
import { useTracesCount } from "../../../../../domains/traces/traces.collection.ts"
import { enqueueTracesExport } from "../../../../../domains/traces/traces.functions.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import {
  EMPTY_SELECTION,
  getBulkSelection,
  getSelectedCount,
  type SelectionState,
} from "../../../../../lib/hooks/useSelectableRows.ts"
import { useRouteProject } from "../-route-data.ts"
import { TargetMonitorsMenu } from "../monitors/-components/target-monitors-menu.tsx"
import { AddToDatasetModal } from "./add-to-dataset-modal.tsx"
import { TraceAggregationsPanel } from "./aggregations/aggregations-panel.tsx"
import { ColumnsSelector } from "./columns-selector.tsx"
import { ExportConfirmationModal } from "./export-confirmation-modal.tsx"
import { TRACE_COLUMN_OPTIONS, type TraceColumnId } from "./project-traces-table.tsx"
import { SaveSearchModal } from "./save-search-modal.tsx"
import { SaveSearchSegment } from "./save-search-segment.tsx"
import { SavedSearchSelector } from "./saved-search-selector.tsx"
import { SearchInput } from "./search-input.tsx"
import { searchHasSemanticPart } from "./semantic-monitor-notice.tsx"
import { SessionDetailDrawer } from "./session-detail-drawer.tsx"
import {
  DEFAULT_SESSION_SORTING,
  getSessionColumnOptions,
  type SessionColumnId,
  SessionsView,
} from "./sessions-view.tsx"
import { useTableColumnSettings } from "./table-column-settings.ts"
import { TimeFilterDropdown } from "./time-filter-dropdown.tsx"
import { TraceDetailDrawer } from "./trace-detail-drawer.tsx"
import { DEFAULT_SEARCH_SORTING, DEFAULT_TRACE_SORTING, parseFilters, serializeFilters } from "./trace-page-state.ts"
import { TracesEmptyOnboarding } from "./traces-empty-onboarding.tsx"
import { TracesView } from "./traces-view.tsx"
import { useProjectTimeWindow } from "./use-project-time-window.ts"

export type ExplorerMode = "traces" | "sessions"

export function ProjectExplorer({ projectSlug }: { readonly projectSlug: string }) {
  const routeProject = useRouteProject()
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )
  const { data: allProjects = [] } = useProjectsCollection()
  const currentProject = project ?? routeProject
  const [activeTab, setActiveTab] = useParamState("tab", "sessions", {
    validate: (v): v is ExplorerMode => v === "traces" || v === "sessions",
  })
  const isSessions = activeTab === "sessions"
  const [filtersOpen, setFiltersOpen] = useParamState("filtersOpen", false)
  const [activeTraceId, setActiveTraceId] = useParamState("traceId", "")
  const [activeSessionId, setActiveSessionId] = useParamState("sessionId", "")
  const [, setSelectedSpanId] = useParamState("spanId", "")
  const [, setSelectedSpanTraceId] = useParamState("spanTraceId", "")
  const [rawFilters, setRawFilters] = useParamState("filters", "")
  const [query, setQuery] = useParamState("query", "")
  const [savedSearchSlug, setSavedSearchSlug] = useParamState("savedSearch", "")
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const navigate = useNavigate()
  const switchTab = useCallback(
    (tab: ExplorerMode) => {
      if (tab === activeTab) return
      setActiveTab(tab)
      setActiveSessionId("")
      setActiveTraceId("")
      setSelectedSpanId("")
      setSelectedSpanTraceId("")
    },
    [activeTab, setActiveTab, setActiveSessionId, setActiveTraceId, setSelectedSpanId, setSelectedSpanTraceId],
  )
  const hasSearchQuery = query.length > 0
  const hasSemanticSearchQuery = searchHasSemanticPart(query)

  // "Create signal from this search" navigates to the Signals page with the builder pre-opened and
  // the current filters seeded (`rawFilters` is already the serialized form the `filters` param uses).
  // We navigate rather than create so the user reviews/names the signal; the semantic query is not
  // seeded yet (R3). `newSignal=1` is the receiver flag on the Signals page.
  const createSignalFromSearch = useCallback(() => {
    void navigate({
      to: "/projects/$projectSlug/signals",
      params: { projectSlug },
      search: { newSignal: "1", ...(rawFilters ? { newSignalFilters: rawFilters } : {}) },
    })
  }, [navigate, projectSlug, rawFilters])
  const { data: loadedSavedSearch } = useSavedSearchBySlug(currentProject.id, savedSearchSlug || null)
  const { monitors: projectMonitors } = useMonitors({ projectId: currentProject.id, limit: 100, system: false })

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

  // Contribute page-level tab switching + filter actions to the palette.
  const paletteCommands = useMemo<readonly PaletteCommand[]>(() => {
    const commands: PaletteCommand[] = []
    if (!isSessions) {
      commands.push({
        id: "traces:view-sessions",
        title: "View sessions",
        icon: MessagesSquareIcon,
        section: "context",
        group: "Traces",
        keywords: "sessions switch",
        perform: () => switchTab("sessions"),
      })
    }
    if (isSessions) {
      commands.push({
        id: "traces:view-traces",
        title: "View traces",
        icon: TextIcon,
        section: "context",
        group: "Traces",
        keywords: "traces switch",
        perform: () => switchTab("traces"),
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
      commands.push({
        id: "traces:create-signal",
        title: "Create signal from this search",
        icon: ShieldAlertIcon,
        section: "context",
        group: "Traces",
        keywords: "signal create evaluation monitor track",
        perform: createSignalFromSearch,
      })
    }
    return commands
  }, [isSessions, filtersOpen, rawFilters, switchTab, setFiltersOpen, setRawFilters, createSignalFromSearch])

  useRegisterCommands(paletteCommands)

  // Sort params stay empty in the URL until the user explicitly sorts, so the
  // effective default can follow the search state: an active search ranks by
  // relevance, a plain listing by recency. Resolving at render time (instead
  // of baking the default into the param) is what lets the default flip when
  // a query is typed or cleared — `useParamState` captures its default at
  // mount.
  const modeDefaultSorting = isSessions ? DEFAULT_SESSION_SORTING : DEFAULT_TRACE_SORTING
  const defaultSorting = hasSearchQuery ? DEFAULT_SEARCH_SORTING : modeDefaultSorting
  const [sortBy, setSortBy] = useParamState("sortBy", "")
  const [sortDirection, setSortDirection] = useParamState("sortDirection", "", {
    validate: (v): v is SortDirection | "" => v === "asc" || v === "desc" || v === "",
  })
  const [traceDetailTab] = useParamState("detailTab", "trace", {
    validate: (v): v is "trace" | "conversation" | "spans" | "scores" | "annotations" =>
      v === "trace" || v === "conversation" || v === "spans" || v === "scores" || v === "annotations",
  })

  // Ref to the ordered list of trace IDs from the currently loaded table page
  const traceIdsRef = useRef<string[]>([])

  const filters = useMemo(() => parseFilters(rawFilters || undefined), [rawFilters])
  // Sessions/Traces date filter: default is "All time"; a picked range lives in `filters.startTime`,
  // and the histogram stays clamped (anchored to latest activity when All time). See the hook.
  const {
    filtersWithDefaultTime,
    effectiveFilters,
    timeFrom,
    timeTo,
    histogramRangeOverride,
    onTimeFilterChange,
    onTimeRangeSelect,
  } = useProjectTimeWindow({
    project: currentProject,
    filters,
    setRawFilters,
    isSessions,
    ...(hasSearchQuery ? { searchQuery: query } : {}),
  })
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
  // A cleared time filter persists as `startTime: []` (explicit "All time"); an empty
  // condition array is not a user-applied filter, so ignore empties here.
  const hasActiveFilters = Object.values(filters).some((conds) => conds.length > 0)
  const hasSelectedSavedSearch = savedSearchSlug.length > 0
  const featureFlags = useFeatureFlags()
  // A custom behavior copies the current filter minus topics (a behavior scoped
  // on behaviors is circular). Only offer it when a non-topics filter exists.
  const customBehaviorSeedFilters = useMemo(() => stripCustomBehaviorExcludedFields(filters), [filters])
  const canCreateCustomBehavior =
    featureFlags.has("customBehaviors") && Object.keys(customBehaviorSeedFilters).length > 0
  const createCustomBehaviorFromFilters = () =>
    navigate({
      to: "/projects/$projectSlug/behaviours/new",
      params: { projectSlug },
      search: { filters: serializeFilters(customBehaviorSeedFilters) },
    })
  const sessionsMonitorTarget = useMemo<MonitorTarget>(
    () => ({
      type: "session",
      id: loadedSavedSearch?.id ?? null,
      kind: "session",
      stream: "sessions",
      filterSet: filters,
      query: query || null,
      savedSearchId: loadedSavedSearch?.id ?? null,
      metric: { kind: "count" },
    }),
    [filters, loadedSavedSearch?.id, query],
  )
  const savedSearchMonitors = useMemo(
    () =>
      projectMonitors.filter((monitor) => monitor.target?.savedSearchId || monitor.rule.source?.type === "savedSearch"),
    [projectMonitors],
  )
  const sorting: InfiniteTableSorting = {
    column: sortBy || defaultSorting.column,
    direction: sortDirection || defaultSorting.direction,
  }

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

  const onShowAllSessions = useCallback(() => {
    setRawFilters(serializeFilters({ ...filters, hasLlmActivity: [{ op: "eq", value: false as const }] }) ?? "")
  }, [filters, setRawFilters])

  // "Clear all" resets the whole search bar: filters, query, and the selected saved search.
  // Also drop an explicit sort so a `relevance` sort doesn't linger in the header after
  // the query is gone — the backend ignores relevance without a search and falls back to
  // recency, which would otherwise leave the header showing a sort the data doesn't follow.
  const clearAll = () => {
    setRawFilters("")
    setQuery("")
    setSavedSearchSlug("")
    setSortBy("")
    setSortDirection("")
  }

  const closeTraceDrawer = useCallback(() => {
    setActiveTraceId("")
    setSelectedSpanId("")
    setSelectedSpanTraceId("")
  }, [setActiveTraceId, setSelectedSpanId, setSelectedSpanTraceId])

  const onActiveTraceChange = (traceId: string | undefined) => {
    if (!traceId) {
      closeTraceDrawer()
      return
    }
    setActiveTraceId(traceId)
  }

  // Sessions surface: clicking a session row opens the session detail panel. A
  // trace reference (currently only via deep link) also sets `traceId` so the
  // panel slides straight into that trace's slot.
  const onOpenSession = useCallback(
    (sessionId: string, traceId?: string) => {
      setActiveSessionId(sessionId)
      setActiveTraceId(traceId ?? "")
      setSelectedSpanId("")
      setSelectedSpanTraceId("")
    },
    [setActiveSessionId, setActiveTraceId, setSelectedSpanId, setSelectedSpanTraceId],
  )

  const closeSessionPanel = useCallback(() => {
    setActiveSessionId("")
    setActiveTraceId("")
    setSelectedSpanId("")
    setSelectedSpanTraceId("")
  }, [setActiveSessionId, setActiveTraceId, setSelectedSpanId, setSelectedSpanTraceId])

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

  // Page-level hotkeys. The trace-drawer Esc only applies in Traces mode; the
  // session panel owns Esc in Sessions mode.
  useHotkeys([
    { hotkey: "F", callback: () => setFiltersOpen((prev) => !prev) },
    {
      hotkey: "1",
      callback: () => switchTab("sessions"),
      options: { enabled: !activeTraceId && !activeSessionId },
    },
    {
      hotkey: "2",
      callback: () => switchTab("traces"),
      options: { enabled: !activeTraceId && !activeSessionId },
    },
    {
      hotkey: "Escape",
      callback: closeTraceDrawer,
      options: { enabled: !!activeTraceId && !activeSessionId, ignoreInputs: true, conflictBehavior: "allow" },
    },
  ])

  // Reads default to All time, so `totalTraceCount` is the unwindowed count — `=== 0` (once loaded)
  // means the project has no traces at all, a robust "empty project" signal. `firstTraceAt` is
  // best-effort (null on backfilled/old-data projects), so it must not gate the onboarding.
  const orgHasConnectedProjects = allProjects.some((p) => p.id !== currentProject.id && p.firstTraceAt != null)
  const showConnectEmptyState = !isTracesCountLoading && totalTraceCount === 0 && !hasActiveFilters && !hasSearchQuery

  if (showConnectEmptyState) {
    return (
      <Layout>
        <TracesEmptyOnboarding
          projectId={currentProject.id}
          projectSlug={currentProject.slug}
          orgHasConnectedProjects={orgHasConnectedProjects}
        />
      </Layout>
    )
  }

  const sharedViewProps = {
    projectId: currentProject.id,
    filters: filtersWithDefaultTime,
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
              onChange={onTimeFilterChange}
            />
            {isSessions ? (
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
                  <kbd className="rounded bg-muted px-1 font-mono text-xs text-muted-foreground">F</kbd>
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
            {(hasActiveFilters || hasSearchQuery || hasSelectedSavedSearch) && (
              <Button variant="ghost" size="sm" onClick={clearAll}>
                <Icon icon={XIcon} size="sm" />
                Clear all
              </Button>
            )}
          </Layout.ActionRowItem>
          <Layout.ActionRowItem>
            {isSessions ? (
              hasSemanticSearchQuery ? (
                <Tooltip
                  asChild
                  trigger={
                    <span className="inline-flex">
                      <Button variant="outline" size="sm" className="h-8 w-auto" disabled>
                        <Icon icon={BellPlusIcon} size="sm" />
                        Monitor sessions
                      </Button>
                    </span>
                  }
                >
                  Semantic searches can’t be monitored. Use exact text or filters to create a sessions monitor.
                </Tooltip>
              ) : (
                <TargetMonitorsMenu
                  projectId={currentProject.id}
                  projectSlug={projectSlug}
                  stream="sessions"
                  filterSetContains={{}}
                  createTarget={sessionsMonitorTarget}
                  label="Monitor sessions"
                  matchMode="exact"
                  fallbackToAllMatches
                  additionalMonitors={savedSearchMonitors}
                />
              )
            ) : null}
            {isSessions && canCreateCustomBehavior ? (
              <Tooltip
                asChild
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-auto"
                    onClick={() => void createCustomBehaviorFromFilters()}
                  >
                    <Icon icon={SlidersHorizontalIcon} size="sm" />
                    Create custom behavior
                  </Button>
                }
              >
                Cluster the sessions matching these filters into their own behavior tree.
              </Tooltip>
            ) : null}
            <Tabs
              variant="bordered"
              size="sm"
              options={[
                {
                  id: "sessions",
                  label: "Sessions",
                  icon: <MessagesSquareIcon className="h-4 w-4" />,
                },
                {
                  id: "traces",
                  label: "Traces",
                  icon: <TextIcon className="h-4 w-4" />,
                },
              ]}
              active={activeTab}
              onSelect={(id) => switchTab(id as ExplorerMode)}
            />
          </Layout.ActionRowItem>
        </Layout.ActionsRow>
        <Layout.ActionsRow className="justify-stretch">
          <div className="flex w-full items-center gap-2">
            {/* Dropdown + input read as one control: a single rounded-lg border wraps both,
                with the dropdown flush on the left (square divider, no inner rounding). */}
            {/* h-10 = 40px outer → 38px inner past the 1px borders, giving the inset h-7 Save
                button comfortable clearance so its hover ring doesn't kiss the bar edges. */}
            <div className="group/searchbar flex h-10 min-w-0 flex-1 items-center overflow-hidden rounded-lg border border-input transition-colors focus-within:ring-1 focus-within:ring-ring">
              <SavedSearchSelector
                projectId={currentProject.id}
                projectSlug={currentProject.slug}
                selectedSlug={savedSearchSlug}
                onSelect={applySavedSearch}
                onSelectedSlugChange={setSavedSearchSlug}
                onSaveCurrent={() => setSaveModalOpen(true)}
                canSaveCurrent={hasSearchQuery || hasActiveFilters}
              />
              <SearchInput key={query} initialValue={query} onSubmit={handleSubmitQuery} />
              <SaveSearchSegment
                projectId={currentProject.id}
                query={query}
                filters={filters}
                selectedSavedSearchSlug={savedSearchSlug}
                loadedSavedSearch={loadedSavedSearch}
                onRequestSave={() => setSaveModalOpen(true)}
              />
            </div>
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
          filters={filtersWithDefaultTime}
          mode={activeTab}
          onTimeRangeSelect={onTimeRangeSelect}
          {...(histogramRangeOverride ? { histogramRangeOverride } : {})}
        />
      </div>

      {isSessions ? (
        <SessionsView
          projectId={currentProject.id}
          filters={filtersWithDefaultTime}
          filtersOpen={filtersOpen}
          activeSessionId={activeSessionId || undefined}
          activeTraceId={activeTraceId || undefined}
          sorting={sorting}
          onSortingChange={onSortingChange}
          selectionState={selectionState}
          onSelectionChange={setSelectionState}
          totalTraceCount={totalTraceCount}
          onFiltersChange={onFiltersChange}
          onShowAllSessions={onShowAllSessions}
          onFiltersClose={() => setFiltersOpen(false)}
          onOpenSession={onOpenSession}
          onCloseSession={closeSessionPanel}
          visibleColumnIds={sessionColumnSettings.visibleColumnIds}
          isSearching={hasSearchQuery}
          hasUserAppliedFilters={hasActiveFilters}
          {...(hasSearchQuery ? { searchQuery: query } : {})}
        />
      ) : (
        <TracesView
          {...sharedViewProps}
          visibleColumnIds={traceColumnSettings.visibleColumnIds}
          {...(hasSearchQuery ? { searchQuery: query } : {})}
        />
      )}

      {!isSessions && activeTraceId ? (
        <Layout.Aside>
          <TraceDetailDrawer
            key={activeTraceId}
            traceId={activeTraceId}
            projectId={currentProject.id}
            filters={filtersWithDefaultTime}
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

      {isSessions && activeSessionId ? (
        <Layout.Aside>
          <SessionDetailDrawer
            key={activeSessionId}
            projectId={currentProject.id}
            sessionId={activeSessionId}
            onClose={closeSessionPanel}
            filters={filtersWithDefaultTime}
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
            itemLabel="trace"
            selectedCount={selectedCount}
            onAddToExisting={(datasetId) =>
              addTracesToDatasetFunction({
                data: {
                  projectId: currentProject.id,
                  datasetId,
                  selection: bulkSelection,
                  filters: effectiveFilters,
                  ...(hasSearchQuery ? { searchQuery: query } : {}),
                },
              })
            }
            onCreateNew={(name) =>
              createDatasetFromTracesFunction({
                data: {
                  projectId: currentProject.id,
                  name,
                  selection: bulkSelection,
                  filters: effectiveFilters,
                  ...(hasSearchQuery ? { searchQuery: query } : {}),
                },
              })
            }
            onSuccess={clearSelections}
          />
        </>
      )}

      {saveModalOpen ? (
        <SaveSearchModal
          mode="create"
          open={saveModalOpen}
          onClose={() => setSaveModalOpen(false)}
          projectId={currentProject.id}
          projectSlug={currentProject.slug}
          query={query || null}
          filterSet={filters}
          onCreated={(record) => {
            setSavedSearchSlug(record.slug)
            setSaveModalOpen(false)
          }}
          onCreateSignal={createSignalFromSearch}
        />
      ) : null}
    </Layout>
  )
}
