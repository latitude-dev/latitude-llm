import type { FilterSet } from "@domain/shared"
import { CopyableText, InfiniteTable, type InfiniteTableColumn, Sheet, Status, Text } from "@repo/ui"
import { formatDuration, relativeTime } from "@repo/utils"
import { type ReactNode, useMemo, useState } from "react"
import { useSessionsInfiniteScroll } from "../../../../../../../domains/sessions/sessions.collection.ts"
import type { SessionRecord } from "../../../../../../../domains/sessions/sessions.functions.ts"
import type { ToolsTimeRange } from "../../../../../../../domains/tools/tools.collection.ts"
import { SessionDetailDrawer } from "../../../-components/session-detail-drawer.tsx"

export function ToolRecentCalls({
  projectId,
  toolName,
  range,
  errorsOnly,
  onOverlayActiveChange,
  headerAction,
}: {
  readonly projectId: string
  readonly toolName: string
  readonly range: ToolsTimeRange
  readonly errorsOnly: boolean
  readonly onOverlayActiveChange?: (active: boolean) => void
  readonly headerAction?: ReactNode
}) {
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)
  const filters = useMemo<FilterSet>(
    () => ({
      tools: [{ op: "in", value: [toolName] }],
      startTime: [
        { op: "gte", value: range.fromIso },
        { op: "lte", value: range.toIso },
      ],
      ...(errorsOnly ? { status: [{ op: "in", value: ["error"] }] } : {}),
    }),
    [errorsOnly, range.fromIso, range.toIso, toolName],
  )
  const {
    data: sessions,
    isLoading,
    infiniteScroll,
  } = useSessionsInfiniteScroll({
    projectId,
    sorting: { column: "startTime", direction: "desc" },
    filters,
  })

  const openSession = (sessionId: string) => {
    setOpenSessionId(sessionId)
    onOverlayActiveChange?.(true)
  }
  const closeSession = () => {
    setOpenSessionId(null)
    onOverlayActiveChange?.(false)
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
      width: 360,
      minWidth: 200,
      render: (session) => (
        <Text.H5 noWrap ellipsis>
          {session.rootSpanName || session.sessionId}
        </Text.H5>
      ),
    },
    {
      key: "session",
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
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Text.H5M color="foreground">{errorsOnly ? "Recent failed sessions" : "Recent sessions"}</Text.H5M>
        {headerAction}
      </div>
      <InfiniteTable
        data={sessions}
        isLoading={isLoading}
        columns={columns}
        getRowKey={(session) => session.sessionId}
        onRowClick={(session) => openSession(session.sessionId)}
        getRowAriaLabel={(session) => `Open session ${session.sessionId}`}
        infiniteScroll={infiniteScroll}
        scrollAreaLayout="intrinsic"
        className="max-h-[420px]"
        blankSlate={errorsOnly ? "No failed sessions in this time window" : "No sessions in this time window"}
      />
      <Sheet open={openSessionId !== null} onClose={closeSession} closeAriaLabel="Close session panel">
        {openSessionId ? (
          <SessionDetailDrawer
            key={openSessionId}
            projectId={projectId}
            sessionId={openSessionId}
            onClose={closeSession}
            filters={filters}
            defaultTab="session"
          />
        ) : null}
      </Sheet>
    </div>
  )
}
