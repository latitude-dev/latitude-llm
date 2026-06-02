import { CopyableText, InfiniteTable, type InfiniteTableColumn, Status, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import {
  type MonitorIncidentRecord,
  useMonitorIncidents,
} from "../../../../../../domains/monitors/monitors.collection.ts"

const columns: InfiniteTableColumn<MonitorIncidentRecord>[] = [
  {
    key: "startedAt",
    header: "Started",
    width: 160,
    minWidth: 120,
    render: (incident) => <Text.H6 noWrap>{relativeTime(new Date(incident.startedAt))}</Text.H6>,
  },
  {
    key: "status",
    header: "Status",
    width: 200,
    minWidth: 150,
    render: (incident) =>
      incident.endedAt ? (
        <Status variant="warning" label={`Closed ${relativeTime(new Date(incident.endedAt))}`} />
      ) : (
        <Status variant="destructive" label={`Ongoing since ${relativeTime(new Date(incident.startedAt))}`} />
      ),
  },
  {
    // Deep-linking to the issue / saved search (and resolving its name) is a UX-milestone polish item.
    key: "source",
    header: "Source",
    width: 180,
    minWidth: 120,
    render: (incident) => <CopyableText value={incident.sourceId} size="sm" ellipsis tooltip="Copy source id" />,
  },
  {
    key: "notified",
    header: "Notified",
    width: 110,
    minWidth: 90,
    render: (incident) =>
      incident.notified ? <Status variant="success" label="Notified" /> : <Status variant="neutral" label="Muted" />,
  },
]

export function MonitorIncidentsTable({ monitorId }: { readonly monitorId: string }) {
  const { incidents, isLoading, infiniteScroll } = useMonitorIncidents({ monitorId })

  return (
    <InfiniteTable
      data={incidents}
      isLoading={isLoading}
      columns={columns}
      getRowKey={(incident) => incident.id}
      infiniteScroll={infiniteScroll}
      blankSlate="No incidents yet."
      scrollAreaLayout="intrinsic"
      className="max-h-[min(28rem,50vh)]"
    />
  )
}
