import type { FilterSet } from "@domain/shared"
import { Button, Icon, type SortDirection, Tooltip, toast } from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeftIcon, DatabaseIcon, DownloadIcon, LayersIcon, PlusIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
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
import { SearchFilterCommand } from "./-components/search-filter-command.tsx"
import { SearchFilterPills } from "./-components/search-filter-pills.tsx"
import { SearchInput } from "./-components/search-input.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/search/")({
  component: SearchPage,
})

interface PaletteState {
  readonly open: boolean
  readonly anchor: HTMLElement | null
  readonly initialField: string | null
}

const CLOSED_PALETTE: PaletteState = { open: false, anchor: null, initialField: null }

function SearchPage() {
  const { projectSlug } = Route.useParams()
  const project = useRouteProject()
  const projectId = project.id

  const [q, setQ] = useParamState("q", "")
  const hasSearchQuery = q.length > 0

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
  const searchInputRef = useRef<HTMLInputElement>(null)
  const addFilterButtonRef = useRef<HTMLButtonElement>(null)

  const filters = parseFilters(rawFilters || undefined)
  const visibleTraceColumnIds = parseTraceColumnIds(rawTraceColumns || undefined)
  const hasActiveFilters = Object.keys(filters).length > 0
  const hasFilterOrQuery = hasSearchQuery || hasActiveFilters
  const sorting = { column: sortBy, direction: sortDirection } as const

  const [selectionState, setSelectionState] = useState<SelectionState<string>>(EMPTY_SELECTION)
  const [addToDatasetOpen, setAddToDatasetOpen] = useState(false)
  const [addToQueueOpen, setAddToQueueOpen] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [palette, setPalette] = useState<PaletteState>(CLOSED_PALETTE)
  const [pendingChipFocus, setPendingChipFocus] = useState<string | null>(null)

  const { totalCount: totalTraceCount, isLoading: isTraceCountLoading } = useTracesCount({
    projectId: hasFilterOrQuery ? projectId : "",
    ...(hasActiveFilters ? { filters } : {}),
    searchQuery: q,
  })

  const showSearchEmptyState = hasFilterOrQuery && !isTraceCountLoading && totalTraceCount === 0

  const selectedCount = getSelectedCount(selectionState, totalTraceCount)
  const bulkSelection = getBulkSelection(selectionState)
  // Bulk actions only render for explicitly-picked rows. `mode: "all"` and
  // `mode: "allExcept"` would resolve server-side against the unfiltered
  // project, ignoring `searchQuery`, which would silently process more
  // traces than the user sees in the UI.
  const showBulkActions = bulkSelection?.mode === "selected"

  // TODO(frontend-use-effect-policy): focus the newly-created chip after the
  // palette commits. The chip with the field id only exists after React
  // re-renders the pills list, so we look it up from the DOM after the
  // state update settles.
  useEffect(() => {
    if (!pendingChipFocus) return
    const target = document.querySelector<HTMLButtonElement>(`[data-chip-field="${pendingChipFocus}"]`)
    target?.focus()
    setPendingChipFocus(null)
  }, [pendingChipFocus])

  const onSortingChange = (next: { column: string; direction: SortDirection }) => {
    setSortBy(next.column)
    setSortDirection(next.direction)
  }

  const commitFilters = (next: FilterSet) => {
    setRawFilters(serializeFilters(next) ?? "")
  }

  const focusSearchInput = () => searchInputRef.current?.focus()

  const closePalette = () => {
    setPalette(CLOSED_PALETTE)
  }

  const openLevel1 = (anchor: HTMLElement) => {
    setPalette({ open: true, anchor, initialField: null })
  }

  const openLevel2 = (field: string, anchor: HTMLElement) => {
    setPalette({ open: true, anchor, initialField: field })
  }

  const onPaletteApply = (next: FilterSet) => {
    const previousFields = new Set(Object.keys(filters))
    const newField = Object.keys(next).find((field) => !previousFields.has(field))
    commitFilters(next)
    closePalette()
    setPendingChipFocus(newField ?? palette.initialField)
  }

  const removeFilter = (field: string) => {
    if (field === "metadata") {
      const next = Object.fromEntries(Object.entries(filters).filter(([key]) => !key.startsWith("metadata.")))
      commitFilters(next)
      return
    }
    const { [field]: _removed, ...rest } = filters
    commitFilters(rest)
  }

  const onTagShortcut = (anchor: HTMLElement) => openLevel2("tags", anchor)

  const focusFirstChipOrAddButton = () => {
    const firstChip = document.querySelector<HTMLButtonElement>("[data-chip-field]")
    if (firstChip) firstChip.focus()
    else addFilterButtonRef.current?.focus()
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
      callback: () => searchInputRef.current?.focus(),
      options: { ignoreInputs: true },
    },
    {
      hotkey: "Mod+K",
      callback: () => searchInputRef.current?.focus(),
    },
    {
      hotkey: "Escape",
      callback: () => {
        if (palette.open) {
          closePalette()
          return
        }
        closeTraceDrawer()
      },
      options: { enabled: palette.open || !!activeTraceId, ignoreInputs: true },
    },
  ])

  return (
    <Layout>
      <Layout.Actions>
        <Layout.ActionsRow className="justify-stretch">
          <div className="relative flex w-full items-center gap-2">
            {hasFilterOrQuery ? (
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
              value={q}
              onCommit={setQ}
              onArrowDown={focusFirstChipOrAddButton}
              onTagShortcut={onTagShortcut}
              inputRef={searchInputRef}
            />
          </div>
        </Layout.ActionsRow>

        <Layout.ActionsRow>
          <div className="flex flex-row flex-wrap items-center gap-2">
            <SearchFilterPills
              filters={filters}
              onRemove={removeFilter}
              onEdit={openLevel2}
              fallbackFocusRef={addFilterButtonRef}
              onArrowUp={focusSearchInput}
            />
            <button
              ref={addFilterButtonRef}
              type="button"
              data-add-filter-button
              onClick={(event) => openLevel1(event.currentTarget)}
              onFocus={(event) => {
                const from = event.relatedTarget as HTMLElement | null
                if (!from) return
                const arrivedFromKeyboardNav = from === searchInputRef.current || from.hasAttribute("data-chip-field")
                if (arrivedFromKeyboardNav) {
                  openLevel1(event.currentTarget)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  const prev = (event.currentTarget.previousElementSibling as HTMLElement | null) ?? null
                  if (prev && prev.tagName === "BUTTON") {
                    event.preventDefault()
                    prev.focus()
                  }
                  return
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault()
                  focusSearchInput()
                }
              }}
              className="inline-flex max-h-6 items-center gap-1 rounded-md border border-dashed border-muted-foreground/30 px-2 py-0.5 text-xs text-muted-foreground outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              <Icon icon={PlusIcon} size="xs" />
              Filter
            </button>
          </div>
        </Layout.ActionsRow>
      </Layout.Actions>

      <SearchFilterCommand
        open={palette.open}
        anchor={palette.anchor}
        initialField={palette.initialField}
        filters={filters}
        onFiltersChange={onPaletteApply}
        onClose={closePalette}
        projectId={projectId}
        searchInputRef={searchInputRef}
      />

      {!hasFilterOrQuery ? <SearchBlankSlate /> : null}

      {hasFilterOrQuery ? (
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

      {hasFilterOrQuery && showBulkActions ? (
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

      {hasFilterOrQuery && !showSearchEmptyState ? (
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

      {hasFilterOrQuery && !showSearchEmptyState && activeTraceId ? (
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

      {hasFilterOrQuery && showBulkActions && bulkSelection ? (
        <ExportConfirmationModal
          open={exportModalOpen}
          onOpenChange={setExportModalOpen}
          itemLabel="trace"
          selectedCount={selectedCount}
          onConfirm={() => void handleExportTraces()}
          exporting={exporting}
        />
      ) : null}

      {hasFilterOrQuery && showBulkActions && bulkSelection ? (
        <AddToDatasetModal
          open={addToDatasetOpen}
          onOpenChange={setAddToDatasetOpen}
          projectId={projectId}
          selection={bulkSelection}
          selectedCount={selectedCount}
          onSuccess={clearSelections}
        />
      ) : null}

      {hasFilterOrQuery && showBulkActions && bulkSelection ? (
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
  )
}
