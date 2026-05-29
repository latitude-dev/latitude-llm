import type { FilterSet } from "@domain/shared"
import {
  Button,
  cn,
  Icon,
  type InfiniteTableSorting,
  Popover,
  PopoverTrigger,
  type SortDirection,
  SplitButton,
  Tooltip,
  toast,
} from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  CircleHelpIcon,
  DatabaseIcon,
  DownloadIcon,
  FilterIcon,
  PinIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import {
  useSavedSearchBySlug,
  useUpdateSavedSearch,
} from "../../../../../domains/saved-searches/saved-searches.collection.ts"
import { useSessionsCount, withSessionDefaults } from "../../../../../domains/sessions/sessions.collection.ts"
import { useTracesCount } from "../../../../../domains/traces/traces.collection.ts"
import { enqueueTracesExport } from "../../../../../domains/traces/traces.functions.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { useSearchSegments } from "../../../../../lib/hooks/useSearchSegments.ts"
import {
  EMPTY_SELECTION,
  getBulkSelection,
  getSelectedCount,
  type SelectionState,
} from "../../../../../lib/hooks/useSelectableRows.ts"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { AddToDatasetModal } from "../-components/add-to-dataset-modal.tsx"
import { ColumnsSelector } from "../-components/columns-selector.tsx"
import { ExportConfirmationModal } from "../-components/export-confirmation-modal.tsx"
import { SaveSearchModal } from "../-components/save-search-modal.tsx"
import { SavedSearchesList } from "../-components/saved-searches-list.tsx"
import { SearchSyntaxLegendContent } from "../-components/search-syntax-legend.tsx"
import { SessionDetailDrawer } from "../-components/session-detail-drawer.tsx"
import { getSessionColumnOptions, type SessionColumnId, SessionsView } from "../-components/sessions-view.tsx"
import { useTableColumnSettings } from "../-components/table-column-settings.ts"
import { TimeFilterDropdown } from "../-components/time-filter-dropdown.tsx"
import {
  DEFAULT_SEARCH_SORTING,
  getTimeFilterValue,
  parseFilters,
  serializeFilters,
} from "../-components/trace-page-state.ts"
import { useRouteProject } from "../-route-data.ts"

const SEARCH_QUERY_MAX_LENGTH = 500

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/search/")({
  staticData: {
    breadcrumb: () => <BreadcrumbText variant="current">Search</BreadcrumbText>,
  },
  component: SearchPage,
})

function SearchPage() {
  const { projectSlug } = Route.useParams()
  const project = useRouteProject()
  const projectId = project.id
  const router = useRouter()

  const [q, setQ] = useParamState("q", "")
  const [savedSearchSlug] = useParamState("savedSearch", "")

  const [filtersOpen, setFiltersOpen] = useParamState("filtersOpen", false)
  const [activeSessionId, setActiveSessionId] = useParamState("sessionId", "")
  const [activeTraceId, setActiveTraceId] = useParamState("traceId", "")
  const [, setSelectedSpanId] = useParamState("spanId", "")
  const [rawFilters, setRawFilters] = useParamState("filters", "")
  const [sortBy, setSortBy] = useParamState("sortBy", DEFAULT_SEARCH_SORTING.column)
  const [sortDirection, setSortDirection] = useParamState("sortDirection", DEFAULT_SEARCH_SORTING.direction, {
    validate: (v): v is SortDirection => v === "asc" || v === "desc",
  })
  const [saveModalOpen, setSaveModalOpen] = useState(false)

  const filters = useMemo(() => parseFilters(rawFilters || undefined), [rawFilters])
  // Sessions hooks (useSessionsInfiniteScroll / useSessionsCount) apply
  // `withSessionDefaults` internally, but everything that hits the *trace*
  // surface (count, export, add-to-dataset) needs the same default applied
  // here so a Select-All export doesn't sweep orphan-fragment traces that
  // the user never saw in the list.
  const effectiveFilters = useMemo(() => withSessionDefaults(filters), [filters])

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
  const sessionColumnSettings = useTableColumnSettings<SessionColumnId>({
    // Distinct from the project Sessions tab (`projects.sessions.columns.v3`)
    // so the two views can keep independent column layouts.
    storageKey: "projects.search.sessions.columns.v1",
    columns: getSessionColumnOptions(true),
  })
  const hasSearchQuery = q.length > 0
  const hasActiveFilters = Object.keys(filters).length > 0
  const hasContent = hasSearchQuery || hasActiveFilters
  const timeFrom = getTimeFilterValue(filters, "gte")
  const timeTo = getTimeFilterValue(filters, "lte")
  const sorting: InfiniteTableSorting = {
    column: sortBy,
    direction: sortDirection,
  }

  const [selectionState, setSelectionState] = useState<SelectionState<string>>(EMPTY_SELECTION)
  const [addToDatasetOpen, setAddToDatasetOpen] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { totalCount, matchingTraceCount } = useSessionsCount({
    projectId: hasContent ? projectId : "",
    ...(hasActiveFilters ? { filters } : {}),
    ...(hasSearchQuery ? { searchQuery: q } : {}),
  })

  // Selection is by traceId (see useSessionSelectionAdapter in sessions-view.tsx).
  // For "select all" semantics across pages and for the bulk-action count label,
  // we need the actual trace count under the current filters/query — not the
  // session count. `useTracesCount` returns exactly that. We pass
  // `effectiveFilters` so the count matches what the sessions list shows
  // (orphan fragments excluded by default).
  const { totalCount: totalTraceCount } = useTracesCount({
    projectId: hasContent ? projectId : "",
    filters: effectiveFilters,
    searchQuery: q,
  })

  const selectedCount = getSelectedCount(selectionState, totalTraceCount)
  const bulkSelection = getBulkSelection(selectionState)
  const showBulkActions = selectedCount > 0

  const onSortingChange = (next: InfiniteTableSorting) => {
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

  // Row click opens the session detail panel. A trace reference (deep link)
  // also sets `traceId` so the panel slides straight into that trace's slot.
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

  // Submitting a new query invalidates the currently-open session/trace context
  // — keep the panel up against the new result set is misleading, so close it.
  const handleSubmitQ = useCallback(
    (next: string) => {
      if (next !== q) closeSessionPanel()
      setQ(next)
    },
    [q, setQ, closeSessionPanel],
  )

  const clearSelections = () => setSelectionState(EMPTY_SELECTION)

  const handleExportTraces = async () => {
    if (!bulkSelection) return

    setExporting(true)
    try {
      await enqueueTracesExport({
        data: {
          projectId,
          selection: bulkSelection,
          filters: effectiveFilters,
          ...(hasSearchQuery ? { searchQuery: q } : {}),
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

  // Esc inside the panel is owned by the panel (back to session, then close).
  useHotkeys([
    {
      hotkey: "F",
      callback: () => setFiltersOpen((prev) => !prev),
      options: { enabled: hasContent },
    },
  ])

  // Count-string variants (spec §PR4 / "Count string + drawer prev/next"):
  //  - filters-only or no content    → "N sessions"
  //  - active search query           → "N sessions · M matching traces"
  // `matchingTraceCount` is populated only when `searchQuery` was active on
  // the server, so we gate on `hasSearchQuery` rather than the optional being
  // present to avoid showing "· 0 matching traces" during the brief load.
  const countLabel = hasSearchQuery
    ? `${totalCount} sessions · ${matchingTraceCount ?? 0} matching traces`
    : `${totalCount} sessions`

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
            <SearchInput key={q} initialValue={q} onSubmit={handleSubmitQ} />
          </div>
        </Layout.ActionsRow>
      </Layout.Actions>

      {!hasContent ? (
        <div className="flex min-h-0 grow flex-col">
          <SavedSearchesList projectId={projectId} projectSlug={projectSlug} behaviorEmptyState="default" />
        </div>
      ) : null}

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
                size="default"
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
              <span className="text-xs text-muted-foreground">{countLabel}</span>
            </Layout.ActionRowItem>
            <Layout.ActionRowItem>
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
              {loadedSavedSearch ? (
                <SplitButton
                  variant="outline"
                  size="default"
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
                <Button variant="outline" size="default" onClick={() => setSaveModalOpen(true)}>
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
        <SessionsView
          projectId={projectId}
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
          isSearching
          {...(hasSearchQuery ? { searchQuery: q } : {})}
        />
      ) : null}

      {hasContent && activeSessionId ? (
        <Layout.Aside>
          <SessionDetailDrawer
            key={activeSessionId}
            projectId={projectId}
            sessionId={activeSessionId}
            onClose={closeSessionPanel}
            filters={filters}
            onFiltersChange={onFiltersChange}
            {...(hasSearchQuery ? { searchQuery: q } : {})}
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
          {...(hasSearchQuery ? { searchQuery: q } : {})}
          filters={effectiveFilters}
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
  const {
    segments,
    registerInput,
    submit,
    updateSegment,
    openPill,
    closePill,
    removeSegment,
    focusSearchEnd,
    focusAdjacentSegment,
  } = useSearchSegments(initialValue, onSubmit, SEARCH_QUERY_MAX_LENGTH)

  const [legendOpen, setLegendOpen] = useState(false)
  const active = segments.some((segment) => segment.text.length > 0) || legendOpen

  return (
    <div
      data-active={active ? "" : undefined}
      className="group/search flex h-10 flex-1 items-center rounded-xl border border-input bg-transparent pl-1 transition-colors focus-within:ring-1 focus-within:ring-ring"
    >
      <Popover open={legendOpen} onOpenChange={setLegendOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Search syntax help">
            <Icon
              icon={SearchIcon}
              size="sm"
              color="foregroundMuted"
              className="group-focus-within/search:hidden group-data-active/search:hidden"
            />
            <Icon
              icon={CircleHelpIcon}
              size="sm"
              color="primary"
              className="hidden group-focus-within/search:block group-data-active/search:block"
            />
          </Button>
        </PopoverTrigger>
        <SearchSyntaxLegendContent
          align="start"
          onCloseAutoFocus={(event) => {
            // Radix's default returns focus to the trigger button, which then
            // shows :focus-visible ring after Esc.
            event.preventDefault()
          }}
        />
      </Popover>
      <div className="flex h-full flex-1 items-center gap-1 overflow-x-auto pr-3 pl-1 text-sm">
        {segments.map((segment, index) => {
          const isSemantic = segment.kind === "semantic"
          const label = segment.kind === "literal" ? "Literal" : "Phrase"
          const placeholder =
            isSemantic && index === 0 ? 'Search by meaning. Use "literal text" or `ordered token phrase`.' : ""
          return (
            <span
              key={segment.id}
              className={cn(
                "inline-flex min-w-0 shrink-0 items-center",
                isSemantic ? "" : "h-7 gap-1 rounded-full border px-2 text-xs font-medium shadow-sm",
                segment.kind === "literal" ? "border-primary/25 bg-primary/10 text-primary" : "",
                segment.kind === "token" ? "border-phrase/30 bg-phrase/10 text-phrase-foreground" : "",
              )}
            >
              {!isSemantic ? <span className="shrink-0 opacity-70">{label}</span> : null}
              <input
                ref={registerInput(segment.id)}
                value={segment.text}
                onChange={(event) => updateSegment(segment, event.target.value)}
                onKeyDown={(event) => {
                  if (segment.kind === "semantic" && (event.key === '"' || event.key === "`")) {
                    event.preventDefault()
                    openPill(segment, event.key, event.currentTarget)
                    return
                  }
                  if (event.key === "Enter") {
                    event.preventDefault()
                    if (segment.kind === "semantic") submit()
                    else closePill(segment)
                    return
                  }
                  if (event.key === "Backspace" && segment.text.length === 0) {
                    event.preventDefault()
                    removeSegment(segment, true)
                    return
                  }
                  if (event.key === "ArrowLeft" && event.currentTarget.selectionStart === 0) {
                    event.preventDefault()
                    focusAdjacentSegment(segment, "previous")
                    return
                  }
                  if (event.key === "ArrowRight" && event.currentTarget.selectionStart === segment.text.length) {
                    event.preventDefault()
                    focusAdjacentSegment(segment, "next")
                  }
                }}
                placeholder={placeholder}
                maxLength={SEARCH_QUERY_MAX_LENGTH}
                className={cn(
                  "bg-transparent outline-none [field-sizing:content] placeholder:text-muted-foreground",
                  isSemantic ? "h-6 min-w-[1ch] text-sm" : "h-6 min-w-[2ch] font-mono text-xs",
                )}
              />
              {!isSemantic ? (
                <button
                  type="button"
                  aria-label={`Remove ${label.toLowerCase()} search pill`}
                  className="-mr-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full opacity-60 transition-opacity hover:bg-current/10 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => removeSegment(segment)}
                >
                  <Icon icon={XIcon} size="xs" />
                </button>
              ) : null}
            </span>
          )
        })}
        <button
          type="button"
          aria-label="Continue typing search query"
          className="h-6 min-w-4 flex-1 cursor-text bg-transparent outline-none"
          onMouseDown={(event) => {
            event.preventDefault()
            focusSearchEnd()
          }}
        />
      </div>
    </div>
  )
}
