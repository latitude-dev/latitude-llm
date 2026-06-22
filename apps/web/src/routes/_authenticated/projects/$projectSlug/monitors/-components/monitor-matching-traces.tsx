import type { MonitorTarget } from "@domain/monitors"
import { Button, CopyableText, Icon, InfiniteTable, type InfiniteTableColumn, Sheet, Status, Text } from "@repo/ui"
import { formatDuration, relativeTime } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { ArrowUpRightIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { targetToSessionFilters } from "../../../../../../domains/monitors/monitor-target.ts"
import { useSessionsInfiniteScroll } from "../../../../../../domains/sessions/sessions.collection.ts"
import type { SessionRecord } from "../../../../../../domains/sessions/sessions.functions.ts"
import { SessionDetailDrawer } from "../../-components/session-detail-drawer.tsx"

const PREVIEW_LIMIT = 8
const SESSION_SORTING = { column: "startTime", direction: "desc" } as const

export function MonitorMatchingTraces({
  projectSlug,
  projectId,
  target,
}: {
  readonly projectSlug: string
  readonly projectId: string
  readonly target: MonitorTarget
}) {
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)
  const { filters, query } = useMemo(() => targetToSessionFilters(target), [target])
  const { data, isLoading } = useSessionsInfiniteScroll({
    projectId,
    sorting: SESSION_SORTING,
    filters,
    ...(query ? { searchQuery: query } : {}),
  })
  const rows = data.slice(0, PREVIEW_LIMIT)

  const viewAllSearch = {
    tab: "sessions",
    filters: JSON.stringify(filters),
    filtersOpen: true,
    ...(query ? { query } : {}),
  }

  const columns: InfiniteTableColumn<SessionRecord>[] = [
    {
      key: "time",
      header: "Time",
      width: 110,
      minWidth: 100,
      render: (session) => (
        <span title={new Date(session.startTime).toLocaleString()}>{relativeTime(new Date(session.startTime))}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 90,
      minWidth: 80,
      render: (session) =>
        session.errorCount > 0 ? (
          <Status variant="destructive" label="error" />
        ) : (
          <Status variant="success" label="ok" />
        ),
    },
    {
      key: "duration",
      header: "Duration",
      width: 90,
      minWidth: 80,
      align: "end",
      render: (session) => <span className="tabular-nums">{formatDuration(session.durationNs)}</span>,
    },
    {
      key: "name",
      header: "Session",
      width: 320,
      minWidth: 200,
      render: (session) => (
        <Text.H5 noWrap ellipsis>
          {session.rootSpanName || session.sessionId}
        </Text.H5>
      ),
    },
    {
      key: "sessionId",
      header: "Session ID",
      width: 160,
      minWidth: 120,
      render: (session) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: click containment only
        <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <CopyableText value={session.sessionId} size="sm" ellipsis tooltip="Copy session id" />
        </div>
      ),
    },
  ]

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Text.H5M color="foreground">Matching sessions</Text.H5M>
        <Button asChild variant="ghost" size="sm" className="w-auto">
          <Link to="/projects/$projectSlug" params={{ projectSlug }} search={viewAllSearch}>
            View all
            <Icon icon={ArrowUpRightIcon} size="sm" />
          </Link>
        </Button>
      </div>
      <InfiniteTable
        data={rows}
        isLoading={isLoading}
        columns={columns}
        getRowKey={(session) => session.sessionId}
        onRowClick={(session) => setOpenSessionId(session.sessionId)}
        getRowAriaLabel={(session) => `Open session ${session.sessionId}`}
        scrollAreaLayout="intrinsic"
        className="max-h-[420px]"
        blankSlate="No matching sessions in the recent window"
      />
      <Sheet open={openSessionId !== null} onClose={() => setOpenSessionId(null)} closeAriaLabel="Close session panel">
        {openSessionId ? (
          <SessionDetailDrawer
            key={openSessionId}
            projectId={projectId}
            sessionId={openSessionId}
            onClose={() => setOpenSessionId(null)}
            {...(query ? { searchQuery: query } : {})}
            filters={filters}
            defaultTab="session"
          />
        ) : null}
      </Sheet>
    </section>
  )
}
