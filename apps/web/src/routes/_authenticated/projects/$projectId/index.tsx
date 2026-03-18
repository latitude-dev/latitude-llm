import {
  Button,
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableSorting,
  Input,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatDuration, formatPrice, relativeTime } from "@repo/utils"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { AppWindowIcon, CalendarIcon, ChevronDown, Columns2Icon, DatabaseIcon, FilterIcon } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useTracesCount, useTracesInfiniteScroll } from "../../../../domains/traces/traces.collection.ts"
import type { TraceRecord } from "../../../../domains/traces/traces.functions.ts"
import { useSelectableRows } from "../../../../lib/hooks/useSelectableRows.ts"
import { AddToDatasetModal } from "./datasets/-components/add-to-dataset-modal.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectId/")({
  component: TracesPage,
})

function StatusBadge({ status }: { status: string }) {
  const color = status === "error" ? "destructive" : "foregroundMuted"
  return <Text.H5 color={color}>{status.toUpperCase()}</Text.H5>
}

function TagBadge({ tag }: { tag: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md bg-muted px-1.5 py-0.5 text-xs leading-4 font-medium text-muted-foreground">
      {tag}
    </span>
  )
}

function TagList({ tags }: { tags: readonly string[] }) {
  if (tags.length === 0) return <Text.H5 color="foregroundMuted">-</Text.H5>
  return (
    <div className="flex items-center justify-end gap-1 overflow-x-auto max-w-full">
      {tags.map((tag) => (
        <TagBadge key={tag} tag={tag} />
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
      <Tooltip trigger={relativeTime(new Date(t.startTime))}>{new Date(t.startTime).toLocaleString()}</Tooltip>
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
    sortKey: "duration",
    render: (t) => formatDuration(t.durationNs),
  },
  {
    key: "cost",
    header: "Cost",
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
    render: (t) => t.models.join(", "),
  },
  {
    key: "spans",
    header: "Spans",
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
  const navigate = useNavigate()
  const [addToDatasetOpen, setAddToDatasetOpen] = useState(false)
  const [sorting, setSorting] = useState<InfiniteTableSorting>(DEFAULT_SORTING)

  const { data: traces, isLoading, infiniteScroll } = useTracesInfiniteScroll({ projectId, sorting })
  const { totalCount } = useTracesCount({ projectId })

  const traceIds = useMemo(() => traces.map((t) => t.traceId), [traces])
  const selection = useSelectableRows({
    rowIds: traceIds,
    totalRowCount: totalCount,
  })

  const getRowKey = useCallback((t: TraceRecord) => t.traceId, [])
  const onRowClick = useCallback(
    (t: TraceRecord) =>
      navigate({
        to: "/projects/$projectId/traces/$traceId/spans",
        params: { projectId, traceId: t.traceId },
      }),
    [navigate, projectId],
  )

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex flex-col p-6 pb-0 gap-3">
        {/* Action buttons */}
        <div className="flex flex-row gap-2 items-center justify-between">
          <div className="flex flex-row gap-2 items-center">
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
          </div>

          <div className="flex flex-row gap-2 items-center">
            <Input placeholder="Search traces" size="sm" className="w-60" disabled />
          </div>
        </div>

        {/* Traces Summary */}
        <div className="w-full flex flex-col bg-secondary rounded-lg p-4 min-h-[144px] items-center justify-center">
          <Text.H5 color="foregroundMuted">Coming soon</Text.H5>
        </div>
      </div>

      <div className="min-h-0 grow">
        <InfiniteTable
          className="p-6 pt-0"
          data={traces}
          isLoading={isLoading}
          columns={columns}
          getRowKey={getRowKey}
          onRowClick={onRowClick}
          selection={selection}
          infiniteScroll={infiniteScroll}
          sorting={sorting}
          defaultSorting={DEFAULT_SORTING}
          onSortChange={setSorting}
        />
      </div>

      <AddToDatasetModal
        open={addToDatasetOpen}
        onOpenChange={setAddToDatasetOpen}
        projectId={projectId}
        traceIds={selection.selectedRowIds}
        onSuccess={selection.clearSelections}
      />
    </div>
  )
}
