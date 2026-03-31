import {
  Button,
  CopyableText,
  cn,
  DetailDrawer,
  ProviderIcon,
  Skeleton,
  type TabOption,
  Tabs,
  Text,
  Tooltip,
  useMountEffect,
} from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  GroupIcon,
  ListTreeIcon,
  MessageSquareIcon,
  MessagesSquareIcon,
} from "lucide-react"
import { useState } from "react"
import { HotkeyBadge } from "../../../../../components/hotkey-badge.tsx"
import { useTraceDetail } from "../../../../../domains/traces/traces.collection.ts"
import type { TraceRecord } from "../../../../../domains/traces/traces.functions.ts"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { AnnotationsTab } from "./trace-detail-drawer/tabs/annotations-tab.tsx"
import { ConversationTab } from "./trace-detail-drawer/tabs/conversation-tab.tsx"
import { SpansTab } from "./trace-detail-drawer/tabs/spans-tab.tsx"
import { TraceTab } from "./trace-detail-drawer/tabs/trace-tab.tsx"

type TabId = "trace" | "conversation" | "spans" | "annotations"

const TABS: TabOption<TabId>[] = [
  { id: "trace", label: "Trace", icon: <GroupIcon className="w-4 h-4" />, tooltip: <HotkeyBadge hotkey="Shift+1" /> },
  {
    id: "conversation",
    label: "Conversation",
    icon: <MessagesSquareIcon className="w-4 h-4" />,
    tooltip: <HotkeyBadge hotkey="Shift+2" />,
  },
  {
    id: "spans",
    label: "Spans",
    icon: <ListTreeIcon className="w-4 h-4" />,
    tooltip: <HotkeyBadge hotkey="Shift+3" />,
  },
  {
    id: "annotations",
    label: "Annotations",
    icon: <MessageSquareIcon className="w-4 h-4" />,
    tooltip: <HotkeyBadge hotkey="Shift+4" />,
  },
]

export function TraceDetailDrawer({
  traceId,
  trace,
  projectId,
  onClose,
  onNextTrace,
  onPrevTrace,
  canNavigateNext,
  canNavigatePrev,
  onTabChange,
}: {
  readonly traceId: string
  readonly trace?: TraceRecord | undefined
  readonly projectId: string
  readonly onClose: () => void
  readonly onNextTrace?: () => void
  readonly onPrevTrace?: () => void
  readonly canNavigateNext: boolean
  readonly canNavigatePrev: boolean
  readonly onTabChange?: (tab: TabId) => void
}) {
  const { data: traceDetail, isLoading: isDetailLoading } = useTraceDetail({
    projectId,
    traceId,
  })
  const isRecordLoading = !trace && !traceDetail
  const traceRecord: TraceRecord | undefined = traceDetail ?? trace
  const [activeTab, setActiveTab] = useState<TabId>("trace")
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<TabId>>(() => new Set(["trace"]))
  const [selectedSpanId, setSelectedSpanId] = useParamState("spanId", "")

  useMountEffect(() => {
    onTabChange?.("trace")
  })

  function handleSetActiveTab(tab: TabId) {
    setActiveTab(tab)
    setVisitedTabs((prev) => new Set([...prev, tab]))
    onTabChange?.(tab)
  }

  function navigateToSpan(spanId: string | null) {
    handleSetActiveTab("spans")
    setSelectedSpanId(spanId ?? "")
  }

  useHotkeys([
    { hotkey: "Shift+1", callback: () => handleSetActiveTab("trace") },
    { hotkey: "Shift+2", callback: () => handleSetActiveTab("conversation") },
    { hotkey: "Shift+3", callback: () => handleSetActiveTab("spans") },
    { hotkey: "Shift+4", callback: () => handleSetActiveTab("annotations") },
    {
      hotkey: "Alt+ArrowDown",
      callback: () => onNextTrace?.(),
      options: { enabled: canNavigateNext && !!onNextTrace },
    },
    {
      hotkey: "Alt+ArrowUp",
      callback: () => onPrevTrace?.(),
      options: { enabled: canNavigatePrev && !!onPrevTrace },
    },
  ])

  return (
    <DetailDrawer
      storeKey="trace-detail-drawer-width"
      onClose={onClose}
      closeLabel={
        <>
          Close <HotkeyBadge hotkey="Escape" />
        </>
      }
      actions={
        <>
          <Tooltip
            asChild
            side="bottom"
            trigger={
              <Button
                variant="ghost"
                className="w-8 h-8 p-0"
                disabled={!canNavigateNext}
                onClick={onNextTrace}
                type="button"
                aria-label="Next trace"
              >
                <ArrowDownIcon className="w-4 h-4 text-muted-foreground" />
              </Button>
            }
          >
            Next trace <HotkeyBadge hotkey="Alt+ArrowDown" /> <HotkeyBadge hotkey="J" />
          </Tooltip>
          <Tooltip
            asChild
            side="bottom"
            trigger={
              <Button
                variant="ghost"
                className="w-8 h-8 p-0"
                disabled={!canNavigatePrev}
                onClick={onPrevTrace}
                type="button"
                aria-label="Previous trace"
              >
                <ArrowUpIcon className="w-4 h-4 text-muted-foreground" />
              </Button>
            }
          >
            Previous trace <HotkeyBadge hotkey="Alt+ArrowUp" /> <HotkeyBadge hotkey="K" />
          </Tooltip>
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
            <CopyableText value={traceId} displayValue={traceId.slice(0, 7)} size="sm" tooltip="Copy trace ID" />
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
            isActive={activeTab === "conversation"}
          />
        )}
      </div>
      <div className={cn("flex flex-col flex-1 overflow-hidden", { hidden: activeTab !== "spans" })}>
        {visitedTabs.has("spans") && (
          <SpansTab
            traceId={traceId}
            selectedSpanId={selectedSpanId}
            onSelectSpan={navigateToSpan}
            isActive={activeTab === "spans"}
          />
        )}
      </div>
      <div className={cn("flex flex-col flex-1 overflow-hidden", { hidden: activeTab !== "annotations" })}>
        {visitedTabs.has("annotations") && <AnnotationsTab projectId={projectId} traceId={traceId} />}
      </div>
    </DetailDrawer>
  )
}
