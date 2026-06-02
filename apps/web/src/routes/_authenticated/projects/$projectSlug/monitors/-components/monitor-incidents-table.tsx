import { CopyableText, InfiniteTable, type InfiniteTableColumn, Status, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { useMemo } from "react"
import {
  type MonitorIncidentRecord,
  useMonitorIncidents,
} from "../../../../../../domains/monitors/monitors.collection.ts"
import { IncidentStatus } from "./incident-status.tsx"

const SOURCE_LINK_CLASS = "truncate text-primary hover:underline underline-offset-2"

/**
 * The incident's source, deep-linked: issue → issue detail, saved search →
 * the saved search on the search page. Falls back to the raw id (copyable)
 * when the source has been deleted and its name couldn't be resolved.
 */
function SourceCell({
  incident,
  projectSlug,
}: {
  readonly incident: MonitorIncidentRecord
  readonly projectSlug: string
}) {
  if (!incident.sourceName) {
    return <CopyableText value={incident.sourceId} size="sm" ellipsis tooltip="Copy source id" />
  }
  if (incident.sourceType === "issue") {
    return (
      <Link
        to="/projects/$projectSlug/issues"
        params={{ projectSlug }}
        search={{ issueId: incident.sourceId }}
        className={SOURCE_LINK_CLASS}
        aria-label={`Open issue ${incident.sourceName}`}
      >
        {incident.sourceName}
      </Link>
    )
  }
  if (incident.sourceType === "savedSearch" && incident.sourceSlug) {
    return (
      <Link
        to="/projects/$projectSlug/search"
        params={{ projectSlug }}
        search={{ savedSearch: incident.sourceSlug }}
        className={SOURCE_LINK_CLASS}
        aria-label={`Open saved search ${incident.sourceName}`}
      >
        {incident.sourceName}
      </Link>
    )
  }
  return (
    <Text.H6 noWrap ellipsis>
      {incident.sourceName}
    </Text.H6>
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

  const columns = useMemo<InfiniteTableColumn<MonitorIncidentRecord>[]>(
    () => [
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
        render: (incident) => <IncidentStatus startedAtIso={incident.startedAt} endedAtIso={incident.endedAt} />,
      },
      {
        key: "source",
        header: "Source",
        width: 180,
        minWidth: 120,
        render: (incident) => <SourceCell incident={incident} projectSlug={projectSlug} />,
      },
      {
        key: "notified",
        header: "Notified",
        width: 110,
        minWidth: 90,
        render: (incident) =>
          incident.notified ? (
            <Status variant="success" label="Notified" />
          ) : (
            <Status variant="neutral" label="Muted" />
          ),
      },
    ],
    [projectSlug],
  )

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
