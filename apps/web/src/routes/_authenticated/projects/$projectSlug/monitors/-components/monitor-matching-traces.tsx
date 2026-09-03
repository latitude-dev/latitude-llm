import { type MonitorTarget, withoutFixedTimeConditions } from "@domain/monitors"
import { Button, CopyableText, Icon, InfiniteTable, type InfiniteTableColumn, Sheet, Status, Text } from "@repo/ui"
import { formatDuration, relativeTime } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { ArrowUpRightIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { targetToSessionFilters } from "../../../../../../domains/monitors/monitor-target.ts"
import { useSavedSearchBySlug } from "../../../../../../domains/saved-searches/saved-searches.collection.ts"
import { useSessionsInfiniteScroll } from "../../../../../../domains/sessions/sessions.collection.ts"
import type { SessionRecord } from "../../../../../../domains/sessions/sessions.functions.ts"
import { SessionDetailDrawer } from "../../-components/session-detail-drawer.tsx"

const PREVIEW_LIMIT = 8
// Monitors evaluate by latest activity, so the preview leads with the sessions a check would see.
const SESSION_SORTING = { column: "lastActivity", direction: "desc" } as const

export function MonitorMatchingTraces({
  projectSlug,
  projectId,
  target,
  savedSearchSlug,
}: {
  readonly projectSlug: string
  readonly projectId: string
  readonly target: MonitorTarget
  /** Set for saved-search monitors, whose target holds a reference instead of a copy of the filters. */
  readonly savedSearchSlug?: string | null
}) {
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)
  // A saved-search target carries `filterSet: null`, so its predicate has to be read back
  // from the search itself — the same resolution the monitor check does. Listing the target's
  // own (empty) filters instead would preview every session in the project.
  const byReference = target.savedSearchId !== null
  const { data: savedSearch, isLoading: isLoadingSavedSearch } = useSavedSearchBySlug(
    projectId,
    byReference ? (savedSearchSlug ?? null) : null,
  )
  // Evaluation ignores fixed date ranges, so the preview has to as well: a search carrying a
  // stale range would otherwise claim nothing matches while the incidents above it pile up.
  const { filters, query } = useMemo(() => {
    const resolved = byReference
      ? { filters: savedSearch?.filterSet ?? {}, query: savedSearch?.query ?? null }
      : targetToSessionFilters(target)
    return { filters: withoutFixedTimeConditions(resolved.filters), query: resolved.query }
  }, [byReference, savedSearch, target])
  const predicateResolved = byReference ? savedSearch !== null : true
  const { data, isLoading } = useSessionsInfiniteScroll({
    projectId,
    sorting: SESSION_SORTING,
    filters,
    enabled: predicateResolved,
    ...(query ? { searchQuery: query } : {}),
  })
  const rows = data.slice(0, PREVIEW_LIMIT)

  // "View all" has to land on the same sessions the preview lists, so it carries the monitor's
  // effective predicate — ranges stripped — rather than letting the dashboard hydrate the saved
  // search's own filters (which the dashboard skips when the link already carries filters). The
  // slug rides along so the dashboard still shows which saved search is in play.
  const viewAllSearch =
    byReference && !savedSearchSlug
      ? null
      : {
          tab: "sessions",
          filters: JSON.stringify(filters),
          filtersOpen: true,
          ...(byReference && savedSearchSlug ? { savedSearch: savedSearchSlug } : {}),
          ...(query ? { query } : {}),
        }

  const columns: InfiniteTableColumn<SessionRecord>[] = [
    {
      key: "time",
      header: "Last activity",
      width: 110,
      minWidth: 100,
      render: (session) => (
        <span title={new Date(session.lastActivityTime).toLocaleString()}>
          {relativeTime(new Date(session.lastActivityTime))}
        </span>
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
        <Text.H5M color="foreground">Sessions</Text.H5M>
        {viewAllSearch ? (
          <Button asChild variant="ghost" size="sm" className="w-auto">
            <Link to="/projects/$projectSlug" params={{ projectSlug }} search={viewAllSearch}>
              View all
              <Icon icon={ArrowUpRightIcon} size="sm" />
            </Link>
          </Button>
        ) : null}
      </div>
      <InfiniteTable
        data={rows}
        isLoading={isLoading || isLoadingSavedSearch}
        columns={columns}
        getRowKey={(session) => session.sessionId}
        onRowClick={(session) => setOpenSessionId(session.sessionId)}
        getRowAriaLabel={(session) => `Open session ${session.sessionId}`}
        scrollAreaLayout="intrinsic"
        className="max-h-[420px]"
        blankSlate="No sessions match this monitor's filters yet"
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
