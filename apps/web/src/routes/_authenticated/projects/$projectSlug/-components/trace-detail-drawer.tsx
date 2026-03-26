import { Button, cn, DetailDrawer, ProviderIcon, Skeleton, type TabOption, Tabs, Text, Tooltip } from "@repo/ui"
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, GroupIcon, ListTreeIcon, MessagesSquareIcon } from "lucide-react"
import { useState } from "react"
import { useTraceDetail } from "../../../../../domains/traces/traces.collection.ts"
import type { TraceRecord } from "../../../../../domains/traces/traces.functions.ts"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { ConversationTab } from "./trace-detail-drawer/tabs/conversation-tab.tsx"
import { SpansTab } from "./trace-detail-drawer/tabs/spans-tab.tsx"
import { TraceTab } from "./trace-detail-drawer/tabs/trace-tab.tsx"

type TabId = "trace" | "conversation" | "spans"

const TABS: TabOption<TabId>[] = [
  { id: "trace", label: "Trace", icon: <GroupIcon className="w-4 h-4" /> },
  { id: "conversation", label: "Conversation", icon: <MessagesSquareIcon className="w-4 h-4" /> },
  { id: "spans", label: "Spans", icon: <ListTreeIcon className="w-4 h-4" /> },
]

export function TraceDetailDrawer({
  traceId,
  trace,
  projectId,
  onClose,
}: {
  readonly traceId: string
  readonly trace?: TraceRecord | undefined
  readonly projectId: string
  readonly onClose: () => void
}) {
  const { data: traceDetail, isLoading: isDetailLoading } = useTraceDetail({
    projectId,
    traceId,
  })
  const isRecordLoading = !trace && !traceDetail
  const traceRecord: TraceRecord | undefined = traceDetail ?? trace
  const [activeTab, setActiveTab] = useState<TabId>("trace")
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<TabId>>(() => new Set(["trace"]))
  const [lastTraceId, setLastTraceId] = useState(traceId)
  const [selectedSpanId, setSelectedSpanId] = useParamState("spanId", "")

  // Reset tab state when navigating to a different trace (inline state adjustment
  // avoids a useEffect and its extra render cycle after paint).
  if (lastTraceId !== traceId) {
    setLastTraceId(traceId)
    setActiveTab("trace")
    setVisitedTabs(new Set(["trace"]))
  }
  function handleSetActiveTab(tab: TabId) {
    setActiveTab(tab)
    setVisitedTabs((prev) => new Set([...prev, tab]))
  }

  function navigateToSpan(spanId: string | null) {
    handleSetActiveTab("spans")
    setSelectedSpanId(spanId ?? "")
  }

  return (
    <DetailDrawer
      storeKey="trace-detail-drawer-width"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" size="icon" disabled>
            <ArrowDownIcon className="w-4 h-4 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" disabled>
            <ArrowUpIcon className="w-4 h-4 text-muted-foreground" />
          </Button>
        </>
      }
      header={
        <>
          <div className="flex flex-col gap-1">
            <div className="flex flex-row items-center gap-2">
              {isRecordLoading ? (
                <Skeleton className="h-6 w-48" />
              ) : (
                <>
                  <Text.H4>{traceRecord?.rootSpanName ?? "Unnamed Trace"}</Text.H4>
                  {traceRecord?.providers && traceRecord.providers.length > 0 && (
                    <div className="flex items-center gap-1">
                      {traceRecord.providers.map((p) => (
                        <Tooltip
                          key={p}
                          asChild
                          trigger={
                            <span>
                              <ProviderIcon provider={p} size="sm" />
                            </span>
                          }
                        >
                          {p}
                        </Tooltip>
                      ))}
                    </div>
                  )}
                </>
              )}
              {isRecordLoading ? (
                <Skeleton className="h-6 w-12" />
              ) : traceRecord && traceRecord.errorCount > 0 ? (
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5",
                    "text-xs leading-4 font-medium",
                    "bg-red-500 text-white",
                  )}
                >
                  {traceRecord.errorCount} {traceRecord.errorCount === 1 ? "error" : "errors"}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className={cn(
                "inline-flex shrink-0 items-center gap-1",
                "text-xs leading-4 font-medium text-muted-foreground",
                "hover:text-foreground cursor-pointer",
              )}
              onClick={() => {
                navigator.clipboard.writeText(traceId)
              }}
            >
              <Text.H6 color="foregroundMuted">{traceId}</Text.H6>
              <CopyIcon className="w-4 h-4" />
            </button>
          </div>

          <Tabs options={TABS} active={activeTab} onSelect={handleSetActiveTab} />
        </>
      }
    >
      <div className={cn("flex flex-col flex-1 overflow-hidden", { hidden: activeTab !== "trace" })}>
        {visitedTabs.has("trace") && (
          <TraceTab
            traceId={traceId}
            traceRecord={traceRecord}
            traceDetail={traceDetail}
            isRecordLoading={isRecordLoading}
            isDetailLoading={isDetailLoading}
          />
        )}
      </div>
      <div className={cn("flex flex-col flex-1 overflow-hidden", { hidden: activeTab !== "conversation" })}>
        {visitedTabs.has("conversation") && (
          <ConversationTab
            traceDetail={traceDetail}
            isDetailLoading={isDetailLoading}
            navigateToSpan={navigateToSpan}
            projectId={projectId}
          />
        )}
      </div>
      <div className={cn("flex flex-col flex-1 overflow-hidden", { hidden: activeTab !== "spans" })}>
        {visitedTabs.has("spans") && (
          <SpansTab traceId={traceId} selectedSpanId={selectedSpanId} onSelectSpan={navigateToSpan} />
        )}
      </div>
    </DetailDrawer>
  )
}
