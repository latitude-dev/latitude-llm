import { Button, cn, DetailDrawer, Skeleton, type TabOption, Tabs, Text } from "@repo/ui"
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, GroupIcon, ListTreeIcon, MessagesSquareIcon } from "lucide-react"
import { useState } from "react"
import { useTraceDetail } from "../../../../../domains/traces/traces.collection.ts"
import type { TraceRecord } from "../../../../../domains/traces/traces.functions.ts"
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

  return (
    <DetailDrawer
      storeKey="trace-detail-drawer-width"
      onClose={onClose}
      actions={
        <>
          <Button flat variant="ghost" className="w-8 h-8 p-0" disabled>
            <ArrowDownIcon className="w-4 h-4 text-muted-foreground" />
          </Button>
          <Button flat variant="ghost" className="w-8 h-8 p-0" disabled>
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
                <Text.H4>{traceRecord?.rootSpanName ?? "Unnamed Trace"}</Text.H4>
              )}
              {isRecordLoading ? (
                <Skeleton className="h-6 w-12" />
              ) : (
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5",
                    "text-xs leading-4 font-medium",
                    "bg-muted text-muted-foreground",
                    {
                      "bg-red-500 text-white": traceRecord?.status === "error",
                      "bg-green-500 text-white": traceRecord?.status === "success",
                      "bg-yellow-500 text-white": traceRecord?.status === "warning",
                    },
                  )}
                >
                  {traceRecord?.status?.toUpperCase() ?? "UNKNOWN"}
                </span>
              )}
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

          <Tabs options={TABS} active={activeTab} onSelect={setActiveTab} />
        </>
      }
    >
      {activeTab === "trace" && (
        <TraceTab
          traceId={traceId}
          traceRecord={traceRecord}
          traceDetail={traceDetail}
          isRecordLoading={isRecordLoading}
          isDetailLoading={isDetailLoading}
        />
      )}
      {activeTab === "conversation" && <ConversationTab />}
      {activeTab === "spans" && <SpansTab key={traceId} projectId={projectId} traceId={traceId} />}
    </DetailDrawer>
  )
}
