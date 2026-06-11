import { CopyableText, InfiniteTable, type InfiniteTableColumn, Sheet, Status, Text } from "@repo/ui"
import { formatDuration, relativeTime } from "@repo/utils"
import { useState } from "react"
import { type ToolsTimeRange, useRecentToolCalls } from "../../../../../../../domains/tools/tools.collection.ts"
import type { RecentToolCallRecord } from "../../../../../../../domains/tools/tools.functions.ts"
import { TraceDetailDrawer } from "../../../-components/trace-detail-drawer.tsx"

const STATUS_VARIANT = { ok: "success", error: "destructive", unset: "neutral" } as const

export function ToolRecentCalls({
  projectId,
  toolName,
  range,
  errorsOnly,
  onOverlayActiveChange,
}: {
  readonly projectId: string
  readonly toolName: string
  readonly range: ToolsTimeRange
  readonly errorsOnly: boolean
  readonly onOverlayActiveChange?: (active: boolean) => void
}) {
  const [openCall, setOpenCall] = useState<{ traceId: string; spanId: string } | null>(null)
  const { data: calls, isLoading, infiniteScroll } = useRecentToolCalls({ projectId, toolName, range, errorsOnly })

  const openTrace = (call: { traceId: string; spanId: string }) => {
    setOpenCall(call)
    onOverlayActiveChange?.(true)
  }
  const closeTrace = () => {
    setOpenCall(null)
    onOverlayActiveChange?.(false)
  }

  const columns: InfiniteTableColumn<RecentToolCallRecord>[] = [
    {
      key: "time",
      header: "Time",
      width: 110,
      minWidth: 100,
      render: (call) => (
        <span title={new Date(call.startTime).toLocaleString()}>{relativeTime(new Date(call.startTime))}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 90,
      minWidth: 80,
      render: (call) => (
        <Status
          variant={STATUS_VARIANT[call.statusCode]}
          label={call.statusCode === "error" ? call.errorType || "error" : call.statusCode}
        />
      ),
    },
    {
      key: "duration",
      header: "Duration",
      width: 90,
      minWidth: 80,
      align: "end",
      render: (call) => <span className="tabular-nums">{formatDuration(call.durationNs)}</span>,
    },
    {
      key: "input",
      header: "Input",
      width: 360,
      minWidth: 200,
      render: (call) => (
        <span className="block min-w-0 truncate font-mono text-xs text-muted-foreground" title={call.toolInput}>
          {call.toolInput || "-"}
        </span>
      ),
    },
    {
      key: "output",
      header: "Output",
      width: 280,
      minWidth: 160,
      render: (call) =>
        call.statusCode === "error" && call.statusMessage ? (
          <span className="block min-w-0 truncate text-xs text-rose-600 dark:text-rose-400" title={call.statusMessage}>
            {call.statusMessage}
          </span>
        ) : (
          <span className="block min-w-0 truncate font-mono text-xs text-muted-foreground" title={call.toolOutput}>
            {call.toolOutput || "-"}
          </span>
        ),
    },
    {
      key: "trace",
      header: "Trace",
      width: 140,
      minWidth: 120,
      render: (call) => (
        // Contain clicks/keys so copying the id doesn't open the sheet.
        // biome-ignore lint/a11y/noStaticElementInteractions: click containment only
        <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <CopyableText value={call.traceId} size="sm" ellipsis tooltip="Copy trace id" />
        </div>
      ),
    },
  ]

  return (
    // Plain background: the table rows are themselves bg-secondary.
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <Text.H5M color="foreground">{errorsOnly ? "Recent failed calls" : "Recent calls"}</Text.H5M>
      </div>
      <InfiniteTable
        data={calls}
        isLoading={isLoading}
        columns={columns}
        getRowKey={(call) => call.spanId}
        onRowClick={(call) => openTrace({ traceId: call.traceId, spanId: call.spanId })}
        getRowAriaLabel={(call) => `Open trace of call ${call.toolCallId || call.spanId}`}
        infiniteScroll={infiniteScroll}
        scrollAreaLayout="intrinsic"
        className="max-h-[420px]"
        blankSlate={errorsOnly ? "No failed calls in this time window" : "No calls in this time window"}
      />
      <Sheet open={openCall !== null} onClose={closeTrace} closeAriaLabel="Close trace panel">
        {openCall ? (
          <TraceDetailDrawer
            key={`${openCall.traceId}-${openCall.spanId}`}
            projectId={projectId}
            traceId={openCall.traceId}
            onClose={closeTrace}
            canNavigateNext={false}
            canNavigatePrev={false}
            urlSyncedTabs={false}
            initialTab="spans"
            initialSpanId={openCall.spanId}
            drawerStoreKey="tool-trace-detail-drawer-width"
            closeLabel="Back to tool"
          />
        ) : null}
      </Sheet>
    </div>
  )
}
