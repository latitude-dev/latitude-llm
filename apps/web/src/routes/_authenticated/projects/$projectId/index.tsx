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
import { AppWindowIcon, CalendarIcon, ChevronDown, Columns2Icon, DatabaseIcon, FilterIcon } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { z } from "zod"
import { useTracesCount, useTracesInfiniteScroll } from "../../../../domains/traces/traces.collection.ts"
import type { TraceRecord } from "../../../../domains/traces/traces.functions.ts"
import { ListingLayout as Layout } from "../../../../layouts/ListingLayout/index.tsx"
import { useSelectableRows } from "../../../../lib/hooks/useSelectableRows.ts"
import { TraceDetailDrawer } from "./-components/trace-detail-drawer.tsx"
import { AddToDatasetModal } from "./datasets/-components/add-to-dataset-modal.tsx"

const tracesSearchSchema = z.object({
  traceId: z.string().optional(),
})

export const Route = createFileRoute("/_authenticated/projects/$projectId/")({
  component: TracesPage,
  validateSearch: tracesSearchSchema,
})

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
    key: "ttft",
    header: "Time To First Token",
    align: "end",
    sortKey: "ttft",
    render: (t) => (t.timeToFirstTokenNs > 0 ? formatDuration(t.timeToFirstTokenNs) : "-"),
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

function TracesPage() {
  const { projectId } = Route.useParams()
  const { traceId: activeTraceId } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [addToDatasetOpen, setAddToDatasetOpen] = useState(false)
  const [sorting, setSorting] = useState<InfiniteTableSorting>(DEFAULT_SORTING)

  const { data: traces, isLoading, infiniteScroll } = useTracesInfiniteScroll({ projectId, sorting })
  const { totalCount } = useTracesCount({ projectId })

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
      navigate({
        search: t.traceId === activeTraceId ? {} : { traceId: t.traceId },
        replace: true,
      })
    },
    [navigate, activeTraceId],
  )

  const closeDrawer = useCallback(() => {
    navigate({
      to: ".",
      search: {},
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
                <Button variant="outline" size="sm" flat disabled>
                  <CalendarIcon className="h-4 w-4" />
                  <Text.H6>Last 7 days</Text.H6>
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" flat disabled>
                  <Columns2Icon className="h-4 w-4" />
                  <Text.H6>Columns</Text.H6>
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" flat disabled>
                  <FilterIcon className="h-4 w-4" />
                  <Text.H6>Filters</Text.H6>
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
            <div className="w-full flex flex-col bg-secondary rounded-lg p-4 min-h-[144px] items-center justify-center">
              <Text.H5 color="foregroundMuted">Coming soon</Text.H5>
            </div>
          </Layout.Actions>
          <Layout.List>
            <InfiniteTable
              data={traces}
              isLoading={isLoading}
              columns={columns}
              getRowKey={getRowKey}
              onRowClick={onRowClick}
              activeRowKey={activeTraceId}
              selection={selection}
              infiniteScroll={infiniteScroll}
              sorting={sorting}
              defaultSorting={DEFAULT_SORTING}
              onSortChange={setSorting}
            />
          </Layout.List>
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
