import { CopyableText, InfiniteTable, type InfiniteTableColumn, Sheet, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useState } from "react"
import { type ToolsTimeRange, useRecentDefiningSpans } from "../../../../../../../domains/tools/tools.collection.ts"
import type { RecentDefiningSpanRecord } from "../../../../../../../domains/tools/tools.functions.ts"
import { TraceDetailDrawer } from "../../../-components/trace-detail-drawer.tsx"

export function ToolDefiningTraces({
  projectId,
  toolName,
  range,
  onOverlayActiveChange,
}: {
  readonly projectId: string
  readonly toolName: string
  readonly range: ToolsTimeRange
  readonly onOverlayActiveChange?: (active: boolean) => void
}) {
  const [openSpan, setOpenSpan] = useState<{ traceId: string; spanId: string } | null>(null)
  const { data: spans, isLoading, infiniteScroll } = useRecentDefiningSpans({ projectId, toolName, range })

  const openTrace = (span: { traceId: string; spanId: string }) => {
    setOpenSpan(span)
    onOverlayActiveChange?.(true)
  }
  const closeTrace = () => {
    setOpenSpan(null)
    onOverlayActiveChange?.(false)
  }

  const columns: InfiniteTableColumn<RecentDefiningSpanRecord>[] = [
    {
      key: "time",
      header: "Time",
      width: 110,
      minWidth: 100,
      render: (span) => (
        <span title={new Date(span.startTime).toLocaleString()}>{relativeTime(new Date(span.startTime))}</span>
      ),
    },
    {
      key: "span",
      header: "Span",
      width: 280,
      minWidth: 160,
      render: (span) => (
        <span className="block min-w-0 truncate font-mono text-xs" title={span.name}>
          {span.name || "-"}
        </span>
      ),
    },
    {
      key: "service",
      header: "Service",
      width: 160,
      minWidth: 120,
      render: (span) => (
        <span className="block min-w-0 truncate text-xs text-muted-foreground" title={span.serviceName}>
          {span.serviceName || "-"}
        </span>
      ),
    },
    {
      key: "model",
      header: "Model",
      width: 180,
      minWidth: 120,
      render: (span) => (
        <span className="block min-w-0 truncate text-xs text-muted-foreground" title={span.model}>
          {span.model || "-"}
        </span>
      ),
    },
    {
      key: "trace",
      header: "Trace",
      width: 140,
      minWidth: 120,
      render: (span) => (
        // Contain clicks/keys so copying the id doesn't open the sheet.
        // biome-ignore lint/a11y/noStaticElementInteractions: click containment only
        <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <CopyableText value={span.traceId} size="sm" ellipsis tooltip="Copy trace id" />
        </div>
      ),
    },
  ]

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <Text.H5M color="foreground">Recent traces offering it</Text.H5M>
      </div>
      <InfiniteTable
        data={spans}
        isLoading={isLoading}
        columns={columns}
        getRowKey={(span) => span.spanId}
        onRowClick={(span) => openTrace({ traceId: span.traceId, spanId: span.spanId })}
        getRowAriaLabel={(span) => `Open trace ${span.traceId}`}
        infiniteScroll={infiniteScroll}
        scrollAreaLayout="intrinsic"
        className="max-h-[420px]"
        blankSlate="No chat spans offered this tool in this time window"
      />
      <Sheet open={openSpan !== null} onClose={closeTrace} closeAriaLabel="Close trace panel">
        {openSpan ? (
          <TraceDetailDrawer
            key={`${openSpan.traceId}-${openSpan.spanId}`}
            projectId={projectId}
            traceId={openSpan.traceId}
            onClose={closeTrace}
            canNavigateNext={false}
            canNavigatePrev={false}
            urlSyncedTabs={false}
            initialTab="spans"
            initialSpanId={openSpan.spanId}
            drawerStoreKey="tool-trace-detail-drawer-width"
            closeLabel="Back to tool"
          />
        ) : null}
      </Sheet>
    </div>
  )
}
