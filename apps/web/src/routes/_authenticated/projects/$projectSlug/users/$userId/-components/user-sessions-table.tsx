import {
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableInfiniteScroll,
  type InfiniteTableSorting,
  TagList,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatDuration, formatPrice, relativeTime } from "@repo/utils"
import type { SessionRecord } from "../../../../../../../domains/sessions/sessions.functions.ts"

const COLUMNS: InfiniteTableColumn<SessionRecord>[] = [
  {
    key: "lastActivity",
    header: "Last Activity",
    sortKey: "lastActivity",
    width: 180,
    render: (session) => (
      <Tooltip asChild trigger={<span>{relativeTime(new Date(session.lastActivityTime))}</span>}>
        {new Date(session.lastActivityTime).toLocaleString()}
      </Tooltip>
    ),
  },
  {
    key: "name",
    header: "Name",
    width: 220,
    render: (session) => (
      <div className="flex min-w-0 items-center gap-2">
        <Text.H5 className="min-w-0" noWrap ellipsis>
          {session.rootSpanName || session.sessionId.slice(0, 12)}
        </Text.H5>
        {session.errorCount > 0 ? (
          <Text.H6 color="destructive" noWrap>
            {formatCount(session.errorCount)} {session.errorCount === 1 ? "error" : "errors"}
          </Text.H6>
        ) : null}
      </div>
    ),
  },
  {
    key: "tags",
    header: "Tags",
    width: 150,
    render: (session) => <TagList tags={session.tags} />,
  },
  {
    key: "traces",
    header: "Traces",
    width: 76,
    minWidth: 70,
    align: "end",
    sortKey: "traceCount",
    render: (session) => formatCount(session.traceCount),
  },
  {
    key: "duration",
    header: "Duration",
    width: 110,
    minWidth: 96,
    align: "end",
    sortKey: "duration",
    render: (session) => (session.durationNs > 0 ? formatDuration(session.durationNs) : "-"),
  },
  {
    key: "cost",
    header: "Cost",
    width: 110,
    minWidth: 96,
    align: "end",
    sortKey: "cost",
    render: (session) =>
      session.costTotalMicrocents > 0 ? formatPrice(session.costTotalMicrocents / 100_000_000) : "-",
  },
]

export function UserSessionsTable({
  sessions,
  isLoading,
  infiniteScroll,
  sorting,
  onSortChange,
  activeSessionId,
  onSessionClick,
  blankSlate,
}: {
  readonly sessions: readonly SessionRecord[]
  readonly isLoading: boolean
  readonly infiniteScroll: InfiniteTableInfiniteScroll
  readonly sorting: InfiniteTableSorting
  readonly onSortChange: (sorting: InfiniteTableSorting) => void
  readonly activeSessionId: string | undefined
  readonly onSessionClick: (sessionId: string) => void
  readonly blankSlate: string
}) {
  return (
    <InfiniteTable
      data={sessions}
      isLoading={isLoading}
      columns={COLUMNS}
      getRowKey={(session: SessionRecord) => session.sessionId}
      {...(activeSessionId !== undefined ? { activeRowKey: activeSessionId } : {})}
      onRowClick={(session: SessionRecord) => onSessionClick(session.sessionId)}
      getRowAriaLabel={(session: SessionRecord) =>
        `Open session ${session.rootSpanName || session.sessionId.slice(0, 12)} in the session panel`
      }
      rowInteractionRole="button"
      infiniteScroll={infiniteScroll}
      sorting={sorting}
      defaultSorting={{ column: "lastActivity", direction: "desc" }}
      onSortChange={onSortChange}
      blankSlate={blankSlate}
      scrollAreaLayout="intrinsic"
      className="max-h-[min(32rem,60vh)]"
    />
  )
}
