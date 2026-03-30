import { type FilterSet, filterSetSchema } from "@domain/shared"
import { Button, Input, Tabs } from "@repo/ui"
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
import { useMemo, useState } from "react"
import { useTracesCount } from "../../../../domains/traces/traces.collection.ts"
import { ListingLayout as Layout } from "../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../lib/hooks/useParamState.ts"
import { type BulkSelection, EMPTY_SELECTION, type SelectionState } from "../../../../lib/hooks/useSelectableRows.ts"
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

export const Route = createFileRoute("/_authenticated/projects/$projectId/")({
  component: ProjectPage,
})

function ProjectPage() {
  const { projectId } = Route.useParams()
  const [activeTab, setActiveTab] = useParamState("tab", "traces", {
    validate: (v): v is "traces" | "sessions" => v === "traces" || v === "sessions",
  })
  const [filtersOpen, setFiltersOpen] = useParamState("filtersOpen", false)
  const [activeTraceId, setActiveTraceId] = useParamState("traceId", "")
  const [rawFilters, setRawFilters] = useParamState("filters", "")

  const filters = useMemo(() => parseFilters(rawFilters || undefined), [rawFilters])
  const hasActiveFilters = Object.keys(filters).length > 0
  const timeFrom = getTimeFilterValue(filters, "gte")
  const timeTo = getTimeFilterValue(filters, "lte")

  const [selectionState, setSelectionState] = useState<SelectionState<string>>(EMPTY_SELECTION)
  const [addToDatasetOpen, setAddToDatasetOpen] = useState(false)

  const { totalCount: totalTraceCount } = useTracesCount({
    projectId,
    ...(hasActiveFilters ? { filters } : {}),
  })

  const selectedCount = getSelectedCount(selectionState, totalTraceCount)
  const bulkSelection = getBulkSelection(selectionState)

  const onFiltersChange = (next: FilterSet) => {
    setFiltersOpen(true)
    setRawFilters(serializeFilters(next) ?? "")
  }

  const onActiveTraceChange = (traceId: string | undefined) => {
    setActiveTraceId(traceId ?? "")
  }

  const clearSelections = () => setSelectionState(EMPTY_SELECTION)

  const sharedViewProps = {
    projectId,
    filters,
    filtersOpen,
    activeTraceId: activeTraceId || undefined,
    selectionState,
    onSelectionChange: setSelectionState,
    totalTraceCount,
    onFiltersChange,
    onFiltersClose: () => setFiltersOpen(false),
    onActiveTraceChange,
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
            <Button variant={filtersOpen ? "outline" : "ghost"} size="sm" onClick={() => setFiltersOpen(!filtersOpen)}>
              <FilterIcon className="h-4 w-4" />
              Filters
              {hasActiveFilters && (
                <span className="inline-flex items-center justify-center rounded-full bg-primary px-1.5 text-[10px] leading-4 font-medium text-primary-foreground">
                  {Object.keys(filters).length}
                </span>
              )}
            </Button>
          </Layout.ActionRowItem>
          <Layout.ActionRowItem>
            <Tabs
              variant="bordered"
              hideLabels
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
              onSelect={(id) => setActiveTab(id)}
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

      {activeTab === "traces" ? <TracesView {...sharedViewProps} /> : <SessionsView {...sharedViewProps} />}

      {activeTraceId ? (
        <Layout.Aside>
          <TraceDetailDrawer
            key={activeTraceId}
            traceId={activeTraceId}
            projectId={projectId}
            onClose={() => setActiveTraceId("")}
          />
        </Layout.Aside>
      ) : null}

      {bulkSelection && (
        <AddToDatasetModal
          open={addToDatasetOpen}
          onOpenChange={setAddToDatasetOpen}
          projectId={projectId}
          selection={bulkSelection}
          selectedCount={selectedCount}
          onSuccess={clearSelections}
        />
      )}
    </Layout>
  )
}
