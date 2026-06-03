import { CopyableText, InfiniteTable, type InfiniteTableColumn, Status, Text } from "@repo/ui"
import { formatDuration } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { type ReactNode, useCallback, useMemo } from "react"
import {
  type MonitorIncidentRecord,
  useMonitorIncidents,
} from "../../../../../../domains/monitors/monitors.collection.ts"
import { IncidentStatus } from "./incident-status.tsx"

/**
 * The incident's source as plain text (the whole row is the link, so the name
 * itself isn't a separate anchor). Falls back to the raw id (copyable) when the
 * source was deleted and its name couldn't be resolved.
 */
function SourceCell({ incident }: { readonly incident: MonitorIncidentRecord }) {
  if (!incident.sourceName) {
    return <CopyableText value={incident.sourceId} size="sm" ellipsis tooltip="Copy source id" />
  }
  return (
    <Text.H6 noWrap ellipsis>
      {incident.sourceName}
    </Text.H6>
  )
}

/**
 * How long the incident lasted, as days/hours/minutes/seconds. Ongoing incidents
 * (no close) run up to now; closed incidents use their span. Blank only for a
 * point-in-time incident, which closes the instant it opens (`endedAt === startedAt`).
 */
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
        key: "status",
        header: "Status",
        // Fixed order — ongoing first, then most-recently-closed (see backend
        // keyset). `sortKey` + `defaultSorting` (and no `onSortChange`) renders
        // a static down arrow so the user knows the order without it being interactive.
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
          incident.notified ? (
            <Status variant="success" label="Notified" />
          ) : (
            <Status variant="neutral" label="Muted" />
          ),
      },
    ],
    [],
  )

  // The whole row links to the incident's source (issue / saved search). Rows
  // whose source was deleted (or can't be deep-linked) aren't navigable.
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
            to="/projects/$projectSlug/search"
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
      columns={columns}
      getRowKey={(incident) => incident.id}
      infiniteScroll={infiniteScroll}
      renderRowLink={renderRowLink}
      defaultSorting={{ column: "status", direction: "desc" }}
      blankSlate="No incidents yet."
      scrollAreaLayout="intrinsic"
      className="max-h-[min(28rem,50vh)]"
    />
  )
}
