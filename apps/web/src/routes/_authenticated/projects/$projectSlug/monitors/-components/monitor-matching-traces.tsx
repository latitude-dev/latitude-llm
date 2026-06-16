import type { MonitorTarget } from "@domain/monitors"
import { Button, CopyableText, Icon, InfiniteTable, type InfiniteTableColumn, Sheet, Status, Text } from "@repo/ui"
import { formatDuration, relativeTime } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { ArrowUpRightIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { targetToTraceFilters } from "../../../../../../domains/monitors/monitor-target.ts"
import { useTracesInfiniteScroll } from "../../../../../../domains/traces/traces.collection.ts"
import type { TraceRecord } from "../../../../../../domains/traces/traces.functions.ts"
import { TraceDetailDrawer } from "../../-components/trace-detail-drawer.tsx"

const PREVIEW_LIMIT = 8
const TRACE_SORTING = { column: "startTime", direction: "desc" } as const

export function MonitorMatchingTraces({
  projectSlug,
  projectId,
  target,
}: {
  readonly projectSlug: string
  readonly projectId: string
  readonly target: MonitorTarget
}) {
  const [openTraceId, setOpenTraceId] = useState<string | null>(null)
  const { filters, query } = useMemo(() => targetToTraceFilters(target), [target])
  const { data, isLoading } = useTracesInfiniteScroll({
    projectId,
    sorting: TRACE_SORTING,
    filters,
    ...(query ? { searchQuery: query } : {}),
  })
  const rows = data.slice(0, PREVIEW_LIMIT)

  const viewAllSearch = {
    filters: JSON.stringify(filters),
    filtersOpen: true,
    ...(query ? { query } : {}),
  }

  const columns: InfiniteTableColumn<TraceRecord>[] = [
    {
      key: "time",
      header: "Time",
      width: 110,
      minWidth: 100,
      render: (trace) => (
        <span title={new Date(trace.startTime).toLocaleString()}>{relativeTime(new Date(trace.startTime))}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 90,
      minWidth: 80,
      render: (trace) =>
        trace.errorCount > 0 ? <Status variant="destructive" label="error" /> : <Status variant="success" label="ok" />,
    },
    {
      key: "duration",
      header: "Duration",
      width: 90,
      minWidth: 80,
      align: "end",
      render: (trace) => <span className="tabular-nums">{formatDuration(trace.durationNs)}</span>,
    },
    {
      key: "name",
      header: "Trace",
      width: 320,
      minWidth: 200,
      render: (trace) => (
        <Text.H5 noWrap ellipsis>
          {trace.rootSpanName || trace.traceId}
        </Text.H5>
      ),
    },
    {
      key: "traceId",
      header: "Trace ID",
      width: 160,
      minWidth: 120,
      render: (trace) => (
        // Contain clicks/keys so copying the id doesn't open the sheet.
        // biome-ignore lint/a11y/noStaticElementInteractions: click containment only
        <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <CopyableText value={trace.traceId} size="sm" ellipsis tooltip="Copy trace id" />
        </div>
      ),
    },
  ]

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Text.H5M color="foreground">Matching traces</Text.H5M>
        <Button asChild variant="ghost" size="sm" className="w-auto">
          <Link to="/projects/$projectSlug/traces" params={{ projectSlug }} search={viewAllSearch}>
            View all
            <Icon icon={ArrowUpRightIcon} size="sm" />
          </Link>
        </Button>
      </div>
      <InfiniteTable
        data={rows}
        isLoading={isLoading}
        columns={columns}
        getRowKey={(trace) => trace.traceId}
        onRowClick={(trace) => setOpenTraceId(trace.traceId)}
        getRowAriaLabel={(trace) => `Open trace ${trace.traceId}`}
        scrollAreaLayout="intrinsic"
        className="max-h-[420px]"
        blankSlate="No matching traces in the recent window"
      />
      <Sheet open={openTraceId !== null} onClose={() => setOpenTraceId(null)} closeAriaLabel="Close trace panel">
        {openTraceId ? (
          <TraceDetailDrawer
            key={openTraceId}
            projectId={projectId}
            traceId={openTraceId}
            onClose={() => setOpenTraceId(null)}
            canNavigateNext={false}
            canNavigatePrev={false}
            urlSyncedTabs={false}
            closeLabel="Back to monitor"
          />
        ) : null}
      </Sheet>
    </section>
  )
}
