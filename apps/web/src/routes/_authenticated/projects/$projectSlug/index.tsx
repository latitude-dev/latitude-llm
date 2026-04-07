import { type FilterSet, filterSetSchema } from "@domain/shared"
import { Button, Input, Tabs, Tooltip } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { createFileRoute } from "@tanstack/react-router"
import {
  AppWindowIcon,
  ChevronDown,
  Columns2Icon,
  DatabaseIcon,
  FilterIcon,
  MessagesSquareIcon,
  TextIcon,
} from "lucide-react"
import { useCallback, useMemo, useRef, useState } from "react"
import { HotkeyBadge } from "../../../../components/hotkey-badge.tsx"
import { useProjectsCollection } from "../../../../domains/projects/projects.collection.ts"
import { useTracesCount } from "../../../../domains/traces/traces.collection.ts"
import { ListingLayout as Layout } from "../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../lib/hooks/useParamState.ts"
import { type BulkSelection, EMPTY_SELECTION, type SelectionState } from "../../../../lib/hooks/useSelectableRows.ts"
import { TraceAggregationsPanel } from "./-components/aggregations/aggregations-panel.tsx"
import { SessionDetailDrawer } from "./-components/session-detail-drawer.tsx"
import { SessionsView } from "./-components/sessions-view.tsx"
import { TimeFilterDropdown } from "./-components/time-filter-dropdown.tsx"
import { TraceDetailDrawer } from "./-components/trace-detail-drawer.tsx"
import { TracesView } from "./-components/traces-view.tsx"
import { AddToDatasetModal } from "./datasets/-components/add-to-dataset-modal.tsx"

function parseFilters(raw?: string): FilterSet {
  if (!raw) return {}
  try {
    return filterSetSchema.parse(JSON.parse(raw))
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
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )
  const [activeTab, setActiveTab] = useParamState("tab", "traces", {
    validate: (v): v is "traces" | "sessions" => v === "traces" || v === "sessions",
  })
  const [filtersOpen, setFiltersOpen] = useParamState("filtersOpen", false)
  const [activeTraceId, setActiveTraceId] = useParamState("traceId", "")
  const [activeSessionId, setActiveSessionId] = useParamState("sessionId", "")
  const [rawFilters, setRawFilters] = useParamState("filters", "")

  // Tracks which drawer tab is active so J/K knows when to defer to span navigation
  const [activeDrawerTab, setActiveDrawerTab] = useState<string>("trace")

  // Ref to the ordered list of trace IDs from the currently loaded table page
  const traceIdsRef = useRef<string[]>([])

  const filters = useMemo(() => parseFilters(rawFilters || undefined), [rawFilters])
  const hasActiveFilters = Object.keys(filters).length > 0
  const timeFrom = getTimeFilterValue(filters, "gte")
  const timeTo = getTimeFilterValue(filters, "lte")

  const [selectionState, setSelectionState] = useState<SelectionState<string>>(EMPTY_SELECTION)
  const [addToDatasetOpen, setAddToDatasetOpen] = useState(false)

  const { totalCount: totalTraceCount } = useTracesCount({
    projectId: project?.id ?? "",
    ...(hasActiveFilters ? { filters } : {}),
  })

  const selectedCount = getSelectedCount(selectionState, totalTraceCount)
  const bulkSelection = getBulkSelection(selectionState)

  const onFiltersChange = (next: FilterSet) => {
    setFiltersOpen(true)
    setRawFilters(serializeFilters(next) ?? "")
  }

  const onActiveTraceChange = (traceId: string | undefined) => {
    setActiveSessionId("")
    setActiveTraceId(traceId ?? "")
  }

  const onActiveSessionChange = (sessionId: string | undefined) => {
    setActiveTraceId("")
    setActiveSessionId(sessionId ?? "")
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
      callback: () => setActiveTraceId(""),
      options: { enabled: !!activeTraceId, ignoreInputs: true },
    },
  ])

  const sharedViewProps = {
    projectId: project?.id ?? "",
    filters,
    filtersOpen,
    activeTraceId: activeTraceId || undefined,
    activeDrawerTab,
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
            <Button variant="outline" size="sm" disabled>
              <Columns2Icon className="h-4 w-4" />
              Columns
              <ChevronDown className="h-4 w-4" />
            </Button>
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
                if (id === "traces") setActiveSessionId("")
              }}
            />
            <Input
              placeholder={activeTab === "sessions" ? "Search sessions" : "Search traces"}
              size="sm"
              className="w-60"
              disabled
            />
          </Layout.ActionRowItem>
        </Layout.ActionsRow>
      </Layout.Actions>

      {selectedCount > 0 && (
        <div className="flex items-center gap-2 px-6">
          <Button variant="outline" size="sm" onClick={() => setAddToDatasetOpen(true)}>
            <DatabaseIcon className="h-4 w-4" />
            Add to Dataset ({selectedCount})
          </Button>
        </div>
      )}

      <div className="px-6">
        <TraceAggregationsPanel projectId={project?.id ?? ""} filters={filters} />
      </div>

      {activeTab === "traces" ? (
        <TracesView {...sharedViewProps} />
      ) : (
        <SessionsView {...sharedViewProps} onActiveSessionChange={onActiveSessionChange} />
      )}

      {activeTraceId ? (
        <Layout.Aside>
          <TraceDetailDrawer
            key={activeTraceId}
            traceId={activeTraceId}
            projectId={project?.id ?? ""}
            onClose={() => setActiveTraceId("")}
            onNextTrace={onNextTrace}
            onPrevTrace={onPrevTrace}
            canNavigateNext={canNavigateNext}
            canNavigatePrev={canNavigatePrev}
            onTabChange={setActiveDrawerTab}
          />
        </Layout.Aside>
      ) : activeSessionId && activeTab === "sessions" ? (
        <Layout.Aside>
          <SessionDetailDrawer
            sessionId={activeSessionId}
            projectId={project?.id ?? ""}
            onClose={() => setActiveSessionId("")}
          />
        </Layout.Aside>
      ) : null}

      {bulkSelection && (
        <AddToDatasetModal
          open={addToDatasetOpen}
          onOpenChange={setAddToDatasetOpen}
          projectId={project?.id ?? ""}
          selection={bulkSelection}
          selectedCount={selectedCount}
          onSuccess={clearSelections}
        />
      )}
    </Layout>
  )
}
