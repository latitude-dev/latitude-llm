import { InfiniteTable, type InfiniteTableColumn, Status, Text } from "@repo/ui"
import { formatDuration } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { type ReactNode, useCallback } from "react"
import {
  type MonitorIncidentRecord,
  useMonitorIncidents,
} from "../../../../../../domains/monitors/monitors.collection.ts"
import { IncidentStatus } from "./incident-status.tsx"

/** Human-readable, lowercased source-type labels for the deleted-source fallback. */
const SOURCE_TYPE_LABEL: Record<MonitorIncidentRecord["sourceType"], string> = {
  issue: "issue",
  savedSearch: "saved search",
}

/** Shows the resolved source name, or an italic "Deleted <type>" once the source is gone. */
function SourceCell({ incident }: { readonly incident: MonitorIncidentRecord }) {
  if (!incident.sourceName) {
    return (
      <Text.H6 color="foregroundMuted" noWrap ellipsis className="italic">
        Deleted {SOURCE_TYPE_LABEL[incident.sourceType]}
      </Text.H6>
    )
  }
  return (
    <Text.H6 noWrap ellipsis>
      {incident.sourceName}
    </Text.H6>
  )
}

/** Ongoing incidents run up to now; blank for a point-in-time incident (`endedAt === startedAt`). */
function DurationCell({ incident }: { readonly incident: MonitorIncidentRecord }) {
  const endMs = incident.endedAt ? Date.parse(incident.endedAt) : Date.now()
  const elapsedMs = endMs - Date.parse(incident.startedAt)
  if (incident.endedAt && elapsedMs <= 0) {
    return (
      <Text.H6 color="foregroundMuted" noWrap>
        —
      </Text.H6>
    )
  }
  return <Text.H6 noWrap>{formatDuration(elapsedMs * 1_000_000)}</Text.H6>
}

const INCIDENT_COLUMNS: InfiniteTableColumn<MonitorIncidentRecord>[] = [
  {
    key: "status",
    header: "Status",
    // `sortKey` + `defaultSorting` with no `onSortChange` renders a static (non-interactive) arrow.
    sortKey: "status",
    width: 200,
    minWidth: 150,
    render: (incident) => <IncidentStatus startedAtIso={incident.startedAt} endedAtIso={incident.endedAt} />,
  },
  {
    key: "source",
    header: "Source",
    width: 180,
    minWidth: 120,
    render: (incident) => <SourceCell incident={incident} />,
  },
  {
    key: "duration",
    header: "Duration",
    width: 120,
    minWidth: 90,
    render: (incident) => <DurationCell incident={incident} />,
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

const INCIDENT_DEFAULT_SORTING = { column: "status", direction: "desc" } as const

const INCIDENT_TABLE_CLASS = "max-h-[min(28rem,50vh)]"

export function MonitorIncidentsTableSkeleton() {
  return (
    <InfiniteTable<MonitorIncidentRecord>
      data={[]}
      isLoading
      columns={INCIDENT_COLUMNS}
      getRowKey={(incident) => incident.id}
      defaultSorting={INCIDENT_DEFAULT_SORTING}
      scrollAreaLayout="intrinsic"
      className={INCIDENT_TABLE_CLASS}
    />
  )
}

export function MonitorIncidentsTable({
  projectId,
  projectSlug,
  monitorId,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly monitorId: string
}) {
  const { incidents, isLoading, infiniteScroll } = useMonitorIncidents({ projectId, monitorId })

  // Rows whose source was deleted (or can't be deep-linked) return null and aren't navigable.
  const renderRowLink = useCallback(
    (incident: MonitorIncidentRecord, props: { className: string }): ReactNode => {
      if (incident.sourceType === "issue" && incident.sourceName) {
        return (
          <Link
            to="/projects/$projectSlug/issues"
            params={{ projectSlug }}
            search={{ issueId: incident.sourceId }}
            aria-label={`Open issue ${incident.sourceName}`}
            {...props}
          />
        )
      }
      if (incident.sourceType === "savedSearch" && incident.sourceSlug) {
        return (
          <Link
            to="/projects/$projectSlug"
            params={{ projectSlug }}
            search={{ savedSearch: incident.sourceSlug }}
            aria-label={`Open saved search ${incident.sourceName ?? incident.sourceSlug}`}
            {...props}
          />
        )
      }
      return null
    },
    [projectSlug],
  )

  return (
    <InfiniteTable
      data={incidents}
      isLoading={isLoading}
      columns={INCIDENT_COLUMNS}
      getRowKey={(incident) => incident.id}
      infiniteScroll={infiniteScroll}
      renderRowLink={renderRowLink}
      defaultSorting={INCIDENT_DEFAULT_SORTING}
      blankSlate="No incidents yet."
      scrollAreaLayout="intrinsic"
      className={INCIDENT_TABLE_CLASS}
    />
  )
}
