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
import { z } from "zod"
import { useTracesCount } from "../../../../domains/traces/traces.collection.ts"
import { ListingLayout as Layout } from "../../../../layouts/ListingLayout/index.tsx"
import { type BulkSelection, EMPTY_SELECTION, type SelectionState } from "../../../../lib/hooks/useSelectableRows.ts"
import { SessionsView } from "./-components/sessions-view.tsx"
import { TimeFilterDropdown } from "./-components/time-filter-dropdown.tsx"
import { TraceDetailDrawer } from "./-components/trace-detail-drawer.tsx"
import { TracesView } from "./-components/traces-view.tsx"
import { AddToDatasetModal } from "./datasets/-components/add-to-dataset-modal.tsx"

const searchSchema = z.object({
  tab: z.enum(["traces", "sessions"]).optional(),
  traceId: z.string().optional(),
  filtersOpen: z.boolean().optional(),
  filters: z.string().optional(),
})

type SearchParams = z.infer<typeof searchSchema>

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
  validateSearch: searchSchema,
})

type ActiveTab = "traces" | "sessions"

function ProjectPage() {
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const activeTab: ActiveTab = search.tab ?? "traces"
  const filters = useMemo(() => parseFilters(search.filters), [search.filters])
  const filtersOpen = search.filtersOpen ?? false
  const hasActiveFilters = Object.keys(filters).length > 0
  const timeFrom = getTimeFilterValue(filters, "gte")
  const timeTo = getTimeFilterValue(filters, "lte")
  const activeTraceId = search.traceId

  const [selectionState, setSelectionState] = useState<SelectionState<string>>(EMPTY_SELECTION)
  const [addToDatasetOpen, setAddToDatasetOpen] = useState(false)

  const { totalCount: totalTraceCount } = useTracesCount({
    projectId,
    ...(hasActiveFilters ? { filters } : {}),
  })

  const selectedCount = getSelectedCount(selectionState, totalTraceCount)
  const bulkSelection = getBulkSelection(selectionState)

  const onTabChange = (tab: ActiveTab) => {
    navigate({
      search: (prev: SearchParams) => ({
        ...prev,
        tab: tab === "traces" ? undefined : tab,
      }),
      replace: true,
    })
  }

  const onFiltersChange = (next: FilterSet) => {
    navigate({
      search: (prev: SearchParams) => ({
        ...prev,
        filtersOpen: true,
        filters: serializeFilters(next),
      }),
      replace: true,
    })
  }

  const onFiltersClose = () => {
    navigate({
      search: (prev: SearchParams) => ({ ...prev, filtersOpen: undefined }),
      replace: true,
    })
  }

  const onActiveTraceChange = (traceId: string | undefined) => {
    navigate({
      search: (prev: SearchParams) => ({ ...prev, traceId }),
      replace: true,
    })
  }

  const clearSelections = () => setSelectionState(EMPTY_SELECTION)

  const sharedViewProps = {
    projectId,
    filters,
    filtersOpen,
    activeTraceId,
    selectionState,
    onSelectionChange: setSelectionState,
    totalTraceCount,
    onFiltersChange,
    onFiltersClose,
    onActiveTraceChange,
  }

  return (
    <Layout>
      <Layout.Actions>
        <Layout.ActionsRow>
          <Layout.ActionRowItem>
            <Button variant="outline" size="sm" flat disabled>
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
                navigate({
                  search: (prev: SearchParams) => ({
                    ...prev,
                    filters: serializeFilters(next),
                  }),
                  replace: true,
                })
              }}
            />
            <Button variant="outline" size="sm" flat disabled>
              <Columns2Icon className="h-4 w-4" />
              Columns
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button
              variant={filtersOpen ? "outline" : "ghost"}
              size="sm"
              flat
              onClick={() =>
                navigate({
                  search: (prev: SearchParams) => ({ ...prev, filtersOpen: !filtersOpen || undefined }),
                  replace: true,
                })
              }
            >
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
              onSelect={(id) => onTabChange(id as ActiveTab)}
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
            traceId={activeTraceId}
            projectId={projectId}
            onClose={() => onActiveTraceChange(undefined)}
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
