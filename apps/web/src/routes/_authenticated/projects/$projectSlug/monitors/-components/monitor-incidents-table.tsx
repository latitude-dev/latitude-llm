import { InfiniteTable, type InfiniteTableColumn, Status, Text } from "@repo/ui"
import { formatDuration } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { type ReactNode, useCallback, useState } from "react"
import {
  type MonitorIncidentRecord,
  useMonitorIncidents,
} from "../../../../../../domains/monitors/monitors.collection.ts"
import { listingLayoutIntrinsicScroll } from "../../../../../../layouts/ListingLayout/index.tsx"
import { IncidentResolveConfirmModal } from "./incident-resolve-confirm-modal.tsx"
import { IncidentStatus } from "./incident-status.tsx"

/** Shows the resolved source name, or an italic "Deleted <type>" once the source is gone. */
function SourceCell({ incident }: { readonly incident: MonitorIncidentRecord }) {
  if (incident.sourceType === "monitor") {
    return (
      <Text.H6 color="foregroundMuted" noWrap ellipsis>
        This monitor
      </Text.H6>
    )
  }
  if (!incident.sourceName) {
    return (
      <Text.H6 color="foregroundMuted" noWrap ellipsis className="italic">
        Deleted signal
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

const incidentColumns = (onResolve?: (incidentId: string) => void): InfiniteTableColumn<MonitorIncidentRecord>[] => [
  {
    key: "status",
    header: "Status",
    // `sortKey` + `defaultSorting` with no `onSortChange` renders a static (non-interactive) arrow.
    sortKey: "status",
    width: 200,
    minWidth: 150,
    render: (incident) => (
      <IncidentStatus
        startedAtIso={incident.startedAt}
        endedAtIso={incident.endedAt}
        {...(onResolve && incident.endedAt === null ? { onResolve: () => onResolve(incident.id) } : {})}
      />
    ),
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

export function MonitorIncidentsTableSkeleton() {
  return (
    <InfiniteTable<MonitorIncidentRecord>
      {...listingLayoutIntrinsicScroll.infiniteTable}
      data={[]}
      isLoading
      columns={incidentColumns()}
      getRowKey={(incident) => incident.id}
      defaultSorting={INCIDENT_DEFAULT_SORTING}
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
  const [resolveTarget, setResolveTarget] = useState<string | null>(null)

  // Rows whose producer was deleted (or can't be deep-linked) return null and aren't navigable.
  const renderRowLink = useCallback(
    (incident: MonitorIncidentRecord, props: { className: string }): ReactNode => {
      if (incident.sourceType === "signal" && incident.sourceSlug) {
        return (
          <Link
            to="/projects/$projectSlug/signals/$signalSlug"
            params={{ projectSlug, signalSlug: incident.sourceSlug }}
            aria-label={`Open signal ${incident.sourceName ?? incident.sourceSlug}`}
            {...props}
          />
        )
      }
      return null
    },
    [projectSlug],
  )

  return (
    <>
      <InfiniteTable
        {...listingLayoutIntrinsicScroll.infiniteTable}
        data={incidents}
        isLoading={isLoading}
        columns={incidentColumns(setResolveTarget)}
        getRowKey={(incident) => incident.id}
        infiniteScroll={infiniteScroll}
        renderRowLink={renderRowLink}
        defaultSorting={INCIDENT_DEFAULT_SORTING}
        blankSlate="No incidents yet."
      />
      <IncidentResolveConfirmModal projectId={projectId} incidentId={resolveTarget} onOpenChange={setResolveTarget} />
    </>
  )
}
