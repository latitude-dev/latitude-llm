import type { FilterCondition, FilterSet } from "@domain/shared"
import { Button, cn, Icon, Popover, PopoverAnchor, PopoverContent, type SortDirection, Tooltip, toast } from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeftIcon, DatabaseIcon, DownloadIcon, LayersIcon } from "lucide-react"
import { useRef, useState } from "react"
import { useTracesCount } from "../../../../../domains/traces/traces.collection.ts"
import { enqueueTracesExport } from "../../../../../domains/traces/traces.functions.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { EMPTY_SELECTION, type SelectionState } from "../../../../../lib/hooks/useSelectableRows.ts"
import { ColumnsSelector } from "../-components/columns-selector.tsx"
import { ExportConfirmationModal } from "../-components/export-confirmation-modal.tsx"
import { TRACE_COLUMN_OPTIONS, type TraceColumnId } from "../-components/project-traces-table.tsx"
import { TraceDetailDrawer } from "../-components/trace-detail-drawer.tsx"
import {
  DEFAULT_TRACE_COLUMNS,
  DEFAULT_TRACE_SORTING,
  getBulkSelection,
  getSelectedCount,
  parseFilters,
  parseTraceColumnIds,
  serializeFilters,
  serializeTraceColumnIds,
} from "../-components/trace-page-state.ts"
import { TracesView } from "../-components/traces-view.tsx"
import { useRouteProject } from "../-route-data.ts"
import { AddToQueueModal } from "../annotation-queues/-components/add-to-queue-modal.tsx"
import { AddToDatasetModal } from "../datasets/-components/add-to-dataset-modal.tsx"
import { SearchBlankSlate } from "./-components/search-blank-slate.tsx"
import { SearchEmptyState } from "./-components/search-empty-state.tsx"
import { SearchFilterPanel } from "./-components/search-filter-panel.tsx"
import { SearchFilterPills } from "./-components/search-filter-pills.tsx"
import { SearchInput } from "./-components/search-input.tsx"

const TRIGGER_INPUT_HEIGHT_PX = 40

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/search/")({
  component: SearchPage,
})

/**
 * Drops fields whose conditions are all empty so always-rendered editors
 * don't pollute the URL when their values are cleared.
 */
function cleanFilters(filters: FilterSet): FilterSet {
  const cleaned: Record<string, FilterCondition[]> = {}
  for (const [field, conditions] of Object.entries(filters)) {
    const valid = conditions.filter((cond) => {
      if (Array.isArray(cond.value)) return cond.value.length > 0
      if (typeof cond.value === "string") return cond.value.trim().length > 0
      return cond.value !== undefined && cond.value !== null
    })
    if (valid.length > 0) cleaned[field] = valid
  }
  return cleaned
}

function SearchPage() {
  const { projectSlug } = Route.useParams()
  const project = useRouteProject()
  const projectId = project.id

  const [q, setQ] = useParamState("q", "")
  const hasSearchQuery = q.length > 0

  // Trace listing state — kept at the top level so the layout slots below
  // (`Layout.Actions`, `Layout.Aside`, …) remain DIRECT children of `<Layout>`.
  // `ListingLayout` discovers its panes via `Children.toArray`, which doesn't
  // see through function components.
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

  const traceIdsRef = useRef<string[]>([])
  const triggerInputRef = useRef<HTMLInputElement>(null)
  const panelInputRef = useRef<HTMLInputElement>(null)

  const filters = parseFilters(rawFilters || undefined)
  const visibleTraceColumnIds = parseTraceColumnIds(rawTraceColumns || undefined)
  const hasActiveFilters = Object.keys(filters).length > 0
  const sorting = { column: sortBy, direction: sortDirection } as const

  const [selectionState, setSelectionState] = useState<SelectionState<string>>(EMPTY_SELECTION)
  const [addToDatasetOpen, setAddToDatasetOpen] = useState(false)
  const [addToQueueOpen, setAddToQueueOpen] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Panel state — `draftFilters` and `draftQuery` are the in-progress edits
  // while the panel is open, snapshotted from `filters` / `q` on open and
  // committed back to the URL on close. The trigger input and the panel
  // input both render `draftQuery`; the panel hosts the focused copy when
  // open while the trigger stays invisible behind the popover.
  const [panelOpen, setPanelOpen] = useState(false)
  const [draftFilters, setDraftFilters] = useState<FilterSet>(filters)
  const [draftQuery, setDraftQuery] = useState(q)

  const { totalCount: totalTraceCount, isLoading: isTraceCountLoading } = useTracesCount({
    projectId: hasSearchQuery ? projectId : "",
    ...(hasActiveFilters ? { filters } : {}),
    searchQuery: q,
  })

  const showSearchEmptyState = hasSearchQuery && !isTraceCountLoading && totalTraceCount === 0

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

  const commitFilters = (next: FilterSet) => {
    setRawFilters(serializeFilters(cleanFilters(next)) ?? "")
  }

  const openPanel = () => {
    if (panelOpen) return
    setDraftFilters(filters)
    setDraftQuery(q)
    setPanelOpen(true)
  }

  const applyAndClosePanel = () => {
    if (!panelOpen) return
    setPanelOpen(false)
    commitFilters(draftFilters)
  }

  const focusSearchInput = () => {
    if (panelOpen) {
      panelInputRef.current?.focus()
    } else {
      triggerInputRef.current?.focus()
    }
  }

  const onSearchSubmit = (next: string) => {
    setPanelOpen(false)
    setQ(next)
    commitFilters(draftFilters)
  }

  const removePillFromDraft = (field: string) => {
    setDraftFilters((prev) => {
      if (field === "metadata") {
        return Object.fromEntries(Object.entries(prev).filter(([key]) => !key.startsWith("metadata.")))
      }
      const { [field]: _removed, ...rest } = prev
      return rest
    })
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
    {
      hotkey: "/",
      callback: () => focusSearchInput(),
      options: { ignoreInputs: true },
    },
    {
      hotkey: "Mod+K",
      callback: () => focusSearchInput(),
    },
    {
      hotkey: "Escape",
      callback: () => {
        if (panelOpen) {
          applyAndClosePanel()
          return
        }
        closeTraceDrawer()
      },
      options: { enabled: panelOpen || !!activeTraceId, ignoreInputs: true },
    },
  ])

  const triggerHiddenClass = cn({ "opacity-0 pointer-events-none": panelOpen })

  return (
    <>
      {panelOpen ? (
        <button
          type="button"
          aria-label="Close filter panel"
          className="fixed inset-0 z-40 cursor-default bg-background/50"
          onClick={applyAndClosePanel}
        />
      ) : null}

      <Layout>
        <Layout.Actions>
          <Popover
            open={panelOpen}
            modal={false}
            onOpenChange={(open) => {
              if (!open) applyAndClosePanel()
            }}
          >
            <PopoverAnchor asChild>
              <div className={cn("flex min-w-0 flex-row items-center justify-between gap-2", triggerHiddenClass)}>
                <div className="relative flex w-full items-center gap-2">
                  {hasSearchQuery ? (
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
                  <SearchInput
                    key={q}
                    value={panelOpen ? draftQuery : q}
                    onChange={(next) => {
                      if (!panelOpen) setQ(next)
                      setDraftQuery(next)
                    }}
                    onSubmit={onSearchSubmit}
                    onFocus={openPanel}
                    inputRef={triggerInputRef}
                  />
                </div>
              </div>
            </PopoverAnchor>

            <PopoverContent
              side="bottom"
              align="start"
              sideOffset={-TRIGGER_INPUT_HEIGHT_PX}
              style={{ width: "var(--radix-popover-trigger-width)" }}
              className="max-w-[900px] p-0"
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              <SearchFilterPanel
                projectId={projectId}
                filters={draftFilters}
                onFiltersChange={setDraftFilters}
                onPillRemove={removePillFromDraft}
                query={draftQuery}
                onQueryChange={setDraftQuery}
                onQuerySubmit={onSearchSubmit}
                inputRef={panelInputRef}
              />
            </PopoverContent>
          </Popover>

          {hasActiveFilters ? (
            <Layout.ActionsRow className={triggerHiddenClass}>
              <SearchFilterPills filters={filters} />
            </Layout.ActionsRow>
          ) : null}
        </Layout.Actions>

        {!hasSearchQuery ? <SearchBlankSlate /> : null}

        {hasSearchQuery ? (
          <Layout.Actions className="pt-0">
            <Layout.ActionsRow>
              <Layout.ActionRowItem>
                <ColumnsSelector
                  columns={TRACE_COLUMN_OPTIONS}
                  selectedColumnIds={visibleTraceColumnIds}
                  onChange={(nextColumnIds) =>
                    setRawTraceColumns(serializeTraceColumnIds(nextColumnIds as TraceColumnId[]))
                  }
                />
              </Layout.ActionRowItem>
            </Layout.ActionsRow>
          </Layout.Actions>
        ) : null}

        {hasSearchQuery && showBulkActions ? (
          <div className="flex flex-row items-center gap-2 px-6">
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
        ) : null}

        {hasSearchQuery && !showSearchEmptyState ? (
          <TracesView
            projectId={projectId}
            filters={filters}
            filtersOpen={false}
            activeTraceId={activeTraceId || undefined}
            activeDrawerTab={traceDetailTab}
            sorting={sorting}
            onSortingChange={onSortingChange}
            selectionState={selectionState}
            onSelectionChange={setSelectionState}
            totalTraceCount={totalTraceCount}
            onFiltersChange={commitFilters}
            onFiltersClose={() => {}}
            onActiveTraceChange={onActiveTraceChange}
            traceIdsRef={traceIdsRef}
            visibleColumnIds={visibleTraceColumnIds}
            searchQuery={q}
          />
        ) : null}

        {showSearchEmptyState ? <SearchEmptyState /> : null}

        {hasSearchQuery && !showSearchEmptyState && activeTraceId ? (
          <Layout.Aside>
            <TraceDetailDrawer
              key={activeTraceId}
              traceId={activeTraceId}
              projectId={projectId}
              filters={filters}
              onFiltersChange={commitFilters}
              onClose={closeTraceDrawer}
              onNextTrace={() => navigateTrace(1)}
              onPrevTrace={() => navigateTrace(-1)}
              canNavigateNext={canNavigateNext}
              canNavigatePrev={canNavigatePrev}
            />
          </Layout.Aside>
        ) : null}

        {hasSearchQuery && showBulkActions && bulkSelection ? (
          <ExportConfirmationModal
            open={exportModalOpen}
            onOpenChange={setExportModalOpen}
            itemLabel="trace"
            selectedCount={selectedCount}
            onConfirm={() => void handleExportTraces()}
            exporting={exporting}
          />
        ) : null}

        {hasSearchQuery && showBulkActions && bulkSelection ? (
          <AddToDatasetModal
            open={addToDatasetOpen}
            onOpenChange={setAddToDatasetOpen}
            projectId={projectId}
            selection={bulkSelection}
            selectedCount={selectedCount}
            onSuccess={clearSelections}
          />
        ) : null}

        {hasSearchQuery && showBulkActions && bulkSelection ? (
          <AddToQueueModal
            open={addToQueueOpen}
            onOpenChange={setAddToQueueOpen}
            projectId={projectId}
            projectSlug={projectSlug}
            selection={bulkSelection}
            selectedCount={selectedCount}
            {...(hasActiveFilters ? { filters } : {})}
            onSuccess={clearSelections}
          />
        ) : null}
      </Layout>
    </>
  )
}
