import { type FilterSet, filterSetSchema } from "@domain/shared"
import {
  Button,
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableSorting,
  Input,
  ProviderIcon,
  TagBadge as TagBadgeUI,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatDuration, formatPrice, relativeTime } from "@repo/utils"
import { createFileRoute } from "@tanstack/react-router"
import { AppWindowIcon, ChevronDown, Columns2Icon, DatabaseIcon, FilterIcon } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { z } from "zod"
import { useTracesCount, useTracesInfiniteScroll } from "../../../../domains/traces/traces.collection.ts"
import type { TraceRecord } from "../../../../domains/traces/traces.functions.ts"
import { ListingLayout as Layout } from "../../../../layouts/ListingLayout/index.tsx"
import { useSelectableRows } from "../../../../lib/hooks/useSelectableRows.ts"
import { TimeFilterDropdown } from "./-components/time-filter-dropdown.tsx"
import { TraceDetailDrawer } from "./-components/trace-detail-drawer.tsx"
import { TraceFiltersSidebar } from "./-components/trace-filters-sidebar.tsx"
import { AddToDatasetModal } from "./datasets/-components/add-to-dataset-modal.tsx"

const tracesSearchSchema = z.object({
  traceId: z.string().optional(),
  filtersOpen: z.boolean().optional(),
  filters: z.string().optional(), // JSON-encoded FilterSet
})

type TracesSearch = z.infer<typeof tracesSearchSchema>

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

export const Route = createFileRoute("/_authenticated/projects/$projectId/")({
  component: TracesPage,
  validateSearch: tracesSearchSchema,
})

function StatusBadge({ status }: { status: string }) {
  const color = status === "error" ? "destructive" : "foregroundMuted"
  return <Text.H5 color={color}>{status.toUpperCase()}</Text.H5>
}

function TagList({ tags }: { tags: readonly string[] }) {
  if (tags.length === 0) return <Text.H5 color="foregroundMuted">-</Text.H5>
  return (
    <div className="flex items-center justify-end gap-1 overflow-x-auto max-w-full">
      {tags.map((tag) => (
        <TagBadgeUI key={tag} tag={tag} />
      ))}
    </div>
  )
}

const DEFAULT_SORTING: InfiniteTableSorting = { column: "startTime", direction: "desc" }

const columns: InfiniteTableColumn<TraceRecord>[] = [
  {
    key: "startTime",
    header: "Start Time",
    sortKey: "startTime",
    render: (t) => (
      <Tooltip asChild trigger={<span>{relativeTime(new Date(t.startTime))}</span>}>
        {new Date(t.startTime).toLocaleString()}
      </Tooltip>
    ),
  },
  {
    key: "name",
    header: "Name",
    render: (t) => t.rootSpanName || t.traceId.slice(0, 8),
  },
  {
    key: "tags",
    header: "Tags",
    render: (t) => <TagList tags={t.tags} />,
  },
  {
    key: "duration",
    header: "Duration",
    align: "end",
    sortKey: "duration",
    render: (t) => formatDuration(t.durationNs),
  },
  {
    key: "cost",
    header: "Cost",
    align: "end",
    sortKey: "cost",
    render: (t) => formatPrice(t.costTotalMicrocents / 100_000_000),
  },
  {
    key: "sessionId",
    header: "Session ID",
    render: (t) => t.sessionId,
  },
  {
    key: "userId",
    header: "User ID",
    render: (t) => t.userId,
  },
  {
    key: "status",
    header: "Status",
    render: (t) => <StatusBadge status={t.status} />,
  },
  {
    key: "models",
    header: "Models",
    render: (t) => (
      <div className="flex items-center gap-1.5">
        {t.providers.map((p) => (
          <Tooltip
            asChild
            key={p}
            trigger={
              <span>
                <ProviderIcon provider={p} size="sm" />
              </span>
            }
          >
            {p}
          </Tooltip>
        ))}
        <span className="truncate">{t.models.join(", ")}</span>
      </div>
    ),
  },
  {
    key: "spans",
    header: "Spans",
    align: "end",
    sortKey: "spans",
    render: (t) => (
      <>
        {formatCount(t.spanCount)}
        {t.errorCount > 0 && <span className="text-destructive"> ({t.errorCount} err)</span>}
      </>
    ),
  },
]

function useTraceFiltersFromSearch(): {
  filters: FilterSet
  filtersOpen: boolean
  activeTraceId: string | undefined
} {
  const search = Route.useSearch()
  const filters = useMemo(() => parseFilters(search.filters), [search.filters])
  return { filters, filtersOpen: search.filtersOpen ?? false, activeTraceId: search.traceId }
}

function TracesPage() {
  const { projectId } = Route.useParams()
  const { filters, filtersOpen, activeTraceId } = useTraceFiltersFromSearch()
  const navigate = Route.useNavigate()
  const [addToDatasetOpen, setAddToDatasetOpen] = useState(false)
  const [sorting, setSorting] = useState<InfiniteTableSorting>(DEFAULT_SORTING)

  const hasActiveFilters = Object.keys(filters).length > 0
  const timeFrom = getTimeFilterValue(filters, "gte")
  const timeTo = getTimeFilterValue(filters, "lte")

  const {
    data: traces,
    isLoading,
    infiniteScroll,
  } = useTracesInfiniteScroll({
    projectId,
    sorting,
    ...(hasActiveFilters ? { filters } : {}),
  })
  const { totalCount } = useTracesCount({
    projectId,
    ...(hasActiveFilters ? { filters } : {}),
  })

  const traceIds = useMemo(() => traces.map((t) => t.traceId), [traces])
  const selection = useSelectableRows({
    rowIds: traceIds,
    totalRowCount: totalCount,
  })

  const activeTrace = useMemo(
    () => (activeTraceId ? traces.find((t) => t.traceId === activeTraceId) : undefined),
    [activeTraceId, traces],
  )

  const getRowKey = useCallback((t: TraceRecord) => t.traceId, [])

  const onRowClick = useCallback(
    (t: TraceRecord) => {
      const selection = window.getSelection()
      if (selection && selection.toString().length > 0) return

      navigate({
        search: (prev: TracesSearch) => ({
          ...prev,
          traceId: t.traceId === activeTraceId ? undefined : t.traceId,
        }),
        replace: true,
      })
    },
    [navigate, activeTraceId],
  )

  const closeDrawer = useCallback(() => {
    navigate({
      search: (prev: TracesSearch) => ({ ...prev, traceId: undefined }),
      replace: true,
    })
  }, [navigate])

  return (
    <>
      <Layout>
        <Layout.Content>
          <Layout.Actions>
            <Layout.ActionsRow>
              <Layout.ActionRowItem>
                <Button variant="outline" size="sm" flat disabled>
                  <AppWindowIcon className="h-4 w-4" />
                  <Text.H6>All logs</Text.H6>
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
                      search: (prev: TracesSearch) => ({
                        ...prev,
                        filters: serializeFilters(next),
                      }),
                      replace: true,
                    })
                  }}
                />
                <Button variant="outline" size="sm" flat disabled>
                  <Columns2Icon className="h-4 w-4" />
                  <Text.H6>Columns</Text.H6>
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  variant={filtersOpen ? "outline" : "ghost"}
                  size="sm"
                  flat
                  onClick={() =>
                    navigate({
                      search: (prev: TracesSearch) => ({ ...prev, filtersOpen: !filtersOpen || undefined }),
                      replace: true,
                    })
                  }
                >
                  <FilterIcon className="h-4 w-4" />
                  <Text.H6>Filters</Text.H6>
                  {hasActiveFilters && (
                    <span className="inline-flex items-center justify-center rounded-full bg-primary px-1.5 text-[10px] leading-4 font-medium text-primary-foreground">
                      {Object.keys(filters).length}
                    </span>
                  )}
                </Button>
                {selection.selectedCount > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setAddToDatasetOpen(true)}>
                    <DatabaseIcon className="h-4 w-4" />
                    <Text.H6>Add to Dataset ({selection.selectedCount})</Text.H6>
                  </Button>
                )}
              </Layout.ActionRowItem>
              <Layout.ActionRowItem className="shrink-0">
                <Input placeholder="Search traces" size="sm" className="w-60" disabled />
              </Layout.ActionRowItem>
            </Layout.ActionsRow>
          </Layout.Actions>
          <div className="flex flex-row flex-1 min-h-0 min-w-0 overflow-hidden">
            {filtersOpen && (
              <TraceFiltersSidebar
                projectId={projectId}
                filters={filters}
                onFiltersChange={(next) => {
                  navigate({
                    search: (prev: TracesSearch) => ({
                      ...prev,
                      filtersOpen: true,
                      filters: serializeFilters(next),
                    }),
                    replace: true,
                  })
                }}
                onClose={() =>
                  navigate({
                    search: (prev: TracesSearch) => ({ ...prev, filtersOpen: undefined }),
                    replace: true,
                  })
                }
              />
            )}
            <Layout.List>
              <InfiniteTable
                data={traces}
                isLoading={isLoading}
                columns={columns}
                getRowKey={getRowKey}
                onRowClick={onRowClick}
                {...(activeTraceId ? { activeRowKey: activeTraceId } : {})}
                selection={selection}
                infiniteScroll={infiniteScroll}
                sorting={sorting}
                defaultSorting={DEFAULT_SORTING}
                onSortChange={setSorting}
                blankSlate={hasActiveFilters ? "No traces match the current filters" : "No traces found"}
              />
            </Layout.List>
          </div>
        </Layout.Content>
        {activeTraceId ? (
          <Layout.Aside>
            <TraceDetailDrawer
              traceId={activeTraceId}
              trace={activeTrace}
              projectId={projectId}
              onClose={closeDrawer}
            />
          </Layout.Aside>
        ) : null}
      </Layout>

      {selection.bulkSelection && (
        <AddToDatasetModal
          open={addToDatasetOpen}
          onOpenChange={setAddToDatasetOpen}
          projectId={projectId}
          selection={selection.bulkSelection}
          selectedCount={selection.selectedCount}
          onSuccess={selection.clearSelections}
        />
      )}
    </>
  )
}
