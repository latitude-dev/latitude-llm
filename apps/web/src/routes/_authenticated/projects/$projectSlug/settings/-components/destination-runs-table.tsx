import { Badge, type BadgeProps, InfiniteTable, type InfiniteTableColumn } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useDestinationSyncRuns } from "../../../../../../domains/destinations/destinations.collection.ts"
import type { DestinationSyncRunRecord } from "../../../../../../domains/destinations/destinations.functions.ts"

const RUN_STATUS_BADGE: Record<DestinationSyncRunRecord["status"], { label: string; variant: BadgeProps["variant"] }> =
  {
    succeeded: { label: "Succeeded", variant: "successMuted" },
    failed: { label: "Failed", variant: "destructiveMuted" },
  }

const numberFormatter = new Intl.NumberFormat("en-US")

const columns: InfiniteTableColumn<DestinationSyncRunRecord>[] = [
  {
    key: "ran",
    header: "Ran",
    width: 130,
    minWidth: 110,
    render: (run) => (
      <span title={new Date(run.startedAt).toLocaleString()}>{relativeTime(new Date(run.startedAt))}</span>
    ),
  },
  {
    key: "status",
    header: "Status",
    width: 110,
    minWidth: 90,
    render: (run) => <Badge variant={RUN_STATUS_BADGE[run.status].variant}>{RUN_STATUS_BADGE[run.status].label}</Badge>,
  },
  {
    key: "source",
    header: "Source",
    width: 100,
    minWidth: 80,
    render: (run) => <span className="capitalize">{run.source}</span>,
  },
  {
    key: "recordsRead",
    header: "Records read",
    width: 120,
    minWidth: 100,
    align: "end",
    render: (run) => <span className="tabular-nums">{numberFormatter.format(run.recordsRead)}</span>,
  },
  {
    key: "eventsSent",
    header: "Events sent",
    width: 110,
    minWidth: 90,
    align: "end",
    render: (run) => <span className="tabular-nums">{numberFormatter.format(run.eventsSent)}</span>,
  },
  {
    key: "eventsDropped",
    header: "Dropped",
    width: 90,
    minWidth: 80,
    align: "end",
    render: (run) => (
      <span
        className={
          run.eventsDropped > 0 ? "tabular-nums text-rose-600 dark:text-rose-400" : "tabular-nums text-muted-foreground"
        }
      >
        {numberFormatter.format(run.eventsDropped)}
      </span>
    ),
  },
  {
    key: "error",
    header: "Error",
    width: 280,
    minWidth: 160,
    render: (run) => (
      <span className="block min-w-0 truncate text-xs text-muted-foreground" title={run.error ?? undefined}>
        {run.error ?? "—"}
      </span>
    ),
  },
]

/**
 * Inline sync-run history for one destination — last 25 runs, newest first,
 * with keyset infinite scroll for older runs. Mounted lazily when a
 * destination's runs panel is opened.
 */
export function DestinationRunsTable({ destinationId }: { readonly destinationId: string }) {
  const { runs, isLoading, infiniteScroll } = useDestinationSyncRuns({
    destinationId,
  })

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <InfiniteTable
        data={runs}
        isLoading={isLoading}
        columns={columns}
        getRowKey={(run) => run.id}
        infiniteScroll={infiniteScroll}
        scrollAreaLayout="intrinsic"
        className="max-h-[420px]"
        blankSlate="No data syncronization runs yet."
      />
    </div>
  )
}
