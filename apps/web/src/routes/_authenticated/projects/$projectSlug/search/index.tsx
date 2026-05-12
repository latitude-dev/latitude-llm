import type { FilterSet } from "@domain/shared"
import { Button, cn, Icon, type SortDirection, SplitButton, Tooltip, toast, useMountEffect } from "@repo/ui"
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
import { TRACE_COLUMN_OPTIONS, type TraceColumnId } from "../-components/project-traces-table.tsx"
import { useTableColumnSettings } from "../-components/table-column-settings.ts"
import { TimeFilterDropdown } from "../-components/time-filter-dropdown.tsx"
import { TraceDetailDrawer } from "../-components/trace-detail-drawer.tsx"
import {
  DEFAULT_TRACE_SORTING,
  getTimeFilterValue,
  parseFilters,
  serializeFilters,
} from "../-components/trace-page-state.ts"
import { TracesView } from "../-components/traces-view.tsx"
import { useRouteProject } from "../-route-data.ts"
import { SaveSearchModal } from "./-components/save-search-modal.tsx"
import { SavedSearchesList } from "./-components/saved-searches-list.tsx"

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
  const showBulkActions = selectedCount > 0

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
          {...(hasSearchQuery ? { searchQuery: q } : {})}
          {...(hasActiveFilters ? { filters } : {})}
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

type SearchSegmentKind = "semantic" | "literal" | "token"

type SearchSegment = {
  readonly id: string
  readonly kind: SearchSegmentKind
  readonly text: string
}

let nextSearchSegmentId = 0

function createSearchSegment(kind: SearchSegmentKind, text = ""): SearchSegment {
  nextSearchSegmentId += 1
  return { id: `search-segment-${nextSearchSegmentId.toString()}`, kind, text }
}

function delimiterForKind(kind: SearchSegmentKind): '"' | "`" | "" {
  if (kind === "literal") return '"'
  if (kind === "token") return "`"
  return ""
}

function kindForDelimiter(delimiter: string): SearchSegmentKind | undefined {
  if (delimiter === '"') return "literal"
  if (delimiter === "`") return "token"
  return undefined
}

function parseSearchSegments(value: string): readonly SearchSegment[] {
  const segments: SearchSegment[] = []
  let buffer = ""
  let i = 0

  const flushSemantic = () => {
    const text = buffer.trim()
    if (text.length === 0) {
      buffer = ""
      return
    }
    segments.push(createSearchSegment("semantic", text))
    buffer = ""
  }

  while (i < value.length) {
    const delimiter = value[i]!
    const kind = kindForDelimiter(delimiter)
    if (!kind) {
      buffer += delimiter
      i += 1
      continue
    }

    const close = value.indexOf(delimiter, i + 1)
    if (close === -1) {
      buffer += value.slice(i)
      break
    }

    flushSemantic()
    segments.push(createSearchSegment(kind, value.slice(i + 1, close)))
    i = close + 1
  }

  flushSemantic()
  return segments.length > 0 ? segments : [createSearchSegment("semantic")]
}

function serializeSearchSegments(segments: readonly SearchSegment[]): string {
  return segments
    .map((segment) => {
      if (segment.kind === "semantic") return segment.text
      const delimiter = delimiterForKind(segment.kind)
      return `${delimiter}${segment.text}${delimiter}`
    })
    .join("")
}

function splitSegmentOnDelimiter(segment: SearchSegment, value: string): readonly SearchSegment[] {
  if (segment.kind !== "semantic") return [{ ...segment, text: value }]
  if (!value.includes('"') && !value.includes("`")) return [{ ...segment, text: value }]

  return parseSearchSegments(value)
}

function SearchInput({
  initialValue,
  onSubmit,
}: {
  readonly initialValue: string
  readonly onSubmit: (value: string) => void
}) {
  const [segments, setSegments] = useState(() => parseSearchSegments(initialValue))
  const inputRefs = useRef(new Map<string, HTMLInputElement>())

  const focusSegment = (id: string) => {
    window.setTimeout(() => {
      const input = inputRefs.current.get(id)
      input?.focus()
      input?.setSelectionRange(input.value.length, input.value.length)
    }, 0)
  }

  useMountEffect(() => {
    const first = segments[0]
    if (first) focusSegment(first.id)
  })

  const submit = (nextSegments = segments) => {
    const next = serializeSearchSegments(nextSegments).trim().slice(0, SEARCH_QUERY_MAX_LENGTH)
    onSubmit(next)
  }

  const updateSegment = (segment: SearchSegment, value: string) => {
    const replacement = splitSegmentOnDelimiter(segment, value)
    setSegments((current) => current.flatMap((item) => (item.id === segment.id ? replacement : [item])))
    const focusTarget = replacement[replacement.length - 1]
    if (focusTarget && focusTarget.id !== segment.id) focusSegment(focusTarget.id)
  }

  const openPill = (segment: SearchSegment, delimiter: '"' | "`", input: HTMLInputElement) => {
    const kind = kindForDelimiter(delimiter)
    if (!kind) return

    const start = input.selectionStart ?? segment.text.length
    const end = input.selectionEnd ?? start
    const before = segment.text.slice(0, start).trimEnd()
    const selected = segment.text.slice(start, end)
    const after = segment.text.slice(end).trimStart()
    const pill = createSearchSegment(kind, selected)
    const replacement = [
      ...(before.length > 0 ? [{ ...segment, text: before }] : []),
      pill,
      ...(after.length > 0 ? [createSearchSegment("semantic", after)] : []),
    ]

    setSegments((current) => current.flatMap((item) => (item.id === segment.id ? replacement : [item])))
    focusSegment(pill.id)
  }

  const closePill = (segment: SearchSegment) => {
    const nextSemantic = createSearchSegment("semantic")
    setSegments((current) => {
      const index = current.findIndex((item) => item.id === segment.id)
      if (index === -1) return current
      return [...current.slice(0, index + 1), nextSemantic, ...current.slice(index + 1)]
    })
    focusSegment(nextSemantic.id)
  }

  const removeEmptySegment = (segment: SearchSegment) => {
    setSegments((current) => {
      const index = current.findIndex((item) => item.id === segment.id)
      if (index === -1) return current

      if (current.length === 1) {
        if (segment.kind === "semantic") return current
        const next = createSearchSegment("semantic")
        focusSegment(next.id)
        return [next]
      }

      const next = current.filter((item) => item.id !== segment.id)
      const focusTarget = next[Math.max(0, index - 1)] ?? next[0]
      if (focusTarget) focusSegment(focusTarget.id)
      return next
    })
  }

  return (
    <div className="relative flex-1">
      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
        <Icon icon={SearchIcon} size="sm" color="foregroundMuted" />
      </div>
      <div className="flex h-10 w-full items-center gap-1 overflow-x-auto rounded-xl border border-input bg-transparent pr-3 pl-9 text-sm transition-colors focus-within:ring-1 focus-within:ring-ring">
        {segments.map((segment, index) => {
          const isSemantic = segment.kind === "semantic"
          const label = segment.kind === "literal" ? "Literal" : "Phrase"
          const tooltip =
            segment.kind === "literal"
              ? 'Literal match: searches for this exact case-sensitive text. Serialized with "quotes".'
              : "Phrase match: searches for these tokens adjacent and in order, ignoring punctuation. Serialized with `backticks`."
          const placeholder =
            isSemantic && index === 0 ? 'Search by meaning. Use "literal text" or `ordered token phrase`.' : ""
          const segmentInput = (
            <span
              key={segment.id}
              className={cn(
                "inline-flex min-w-0 shrink-0 items-center",
                isSemantic ? "" : "h-7 gap-1 rounded-full border px-2 text-xs font-medium shadow-sm",
                segment.kind === "literal" ? "border-primary/25 bg-primary/10 text-primary" : "",
                segment.kind === "token"
                  ? "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300"
                  : "",
              )}
            >
              {!isSemantic ? <span className="shrink-0 opacity-70">{label}</span> : null}
              <input
                ref={(node) => {
                  if (node) inputRefs.current.set(segment.id, node)
                  else inputRefs.current.delete(segment.id)
                }}
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
                    removeEmptySegment(segment)
                  }
                }}
                placeholder={placeholder}
                maxLength={SEARCH_QUERY_MAX_LENGTH}
                className={cn(
                  "bg-transparent outline-none [field-sizing:content] placeholder:text-muted-foreground",
                  isSemantic ? "h-6 min-w-[1ch] text-sm" : "h-6 min-w-[2ch] font-mono text-xs",
                )}
              />
            </span>
          )

          if (isSemantic) return segmentInput

          return (
            <Tooltip key={segment.id} asChild side="bottom" align="start" delayDuration={400} trigger={segmentInput}>
              {tooltip}
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}
