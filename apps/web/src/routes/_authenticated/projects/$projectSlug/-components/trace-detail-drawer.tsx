import type { FilterSet } from "@domain/shared"
import {
  Button,
  CopyableText,
  cn,
  DetailDrawer,
  Icon,
  ProviderIcon,
  Skeleton,
  Status,
  type TabOption,
  Tabs,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount } from "@repo/utils"
import { useHotkeys } from "@tanstack/react-hotkeys"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  GroupIcon,
  ListTreeIcon,
  MessageSquareIcon,
  MessagesSquareIcon,
} from "lucide-react"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { HotkeyBadge } from "../../../../../components/hotkey-badge.tsx"
import { useAnnotationsByTrace } from "../../../../../domains/annotations/annotations.collection.ts"
import type { AnnotationRecord } from "../../../../../domains/annotations/annotations.functions.ts"
import { useTraceDetail } from "../../../../../domains/traces/traces.collection.ts"
import type { TraceRecord } from "../../../../../domains/traces/traces.functions.ts"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { isGlobalAnnotation } from "./annotations/hooks/use-annotation-navigation.ts"
import { useConversationAnnotationFocus } from "./annotations/hooks/use-conversation-annotation-focus.ts"
import { TraceAnnotationsList } from "./annotations/trace-annotations-list.tsx"
import { ConversationTab } from "./trace-detail-drawer/tabs/conversation-tab.tsx"
import { SpansTab } from "./trace-detail-drawer/tabs/spans-tab.tsx"
import { TraceTab } from "./trace-detail-drawer/tabs/trace-tab.tsx"

type TabId = "trace" | "conversation" | "spans" | "annotations"

const TABS: TabOption<TabId>[] = [
  {
    id: "trace",
    label: "Trace",
    icon: <Icon icon={GroupIcon} size="sm" />,
  },
  {
    id: "conversation",
    label: "Conversation",
    icon: <Icon icon={MessagesSquareIcon} size="sm" />,
  },
  {
    id: "spans",
    label: "Spans",
    icon: <Icon icon={ListTreeIcon} size="sm" />,
  },
  {
    id: "annotations",
    label: "Annotations",
    icon: <Icon icon={MessageSquareIcon} size="sm" />,
  },
]

function isTraceDetailTab(v: string): v is TabId {
  return v === "trace" || v === "conversation" || v === "spans" || v === "annotations"
}

const tabCountPillClass =
  "inline-flex min-h-5 min-w-[1.125rem] shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-[0.6875rem] font-medium leading-none text-muted-foreground"

function getAnnotationTabSuffix({
  annotationsByTraceError,
  annotationsByTraceLoading,
  annotationCount,
}: {
  readonly annotationsByTraceError: boolean
  readonly annotationsByTraceLoading: boolean
  readonly annotationCount: number
}): ReactNode {
  if (annotationsByTraceError) {
    return <span className={tabCountPillClass}>–</span>
  }
  if (annotationsByTraceLoading) {
    return null
  }
  if (annotationCount === 0) {
    return null
  }
  return <span className={cn(tabCountPillClass, "tabular-nums")}>{annotationCount}</span>
}

function getSpansTabSuffix(spanCount: number | undefined): ReactNode {
  if (spanCount === undefined || spanCount === 0) {
    return null
  }
  return <span className={cn(tabCountPillClass, "tabular-nums")}>{spanCount}</span>
}

export type TraceDetailDrawerProps = {
  readonly traceId: string
  readonly trace?: TraceRecord | undefined
  readonly projectId: string
  readonly filters?: FilterSet | undefined
  readonly onFiltersChange?: (filters: FilterSet) => void
  readonly onClose: () => void
  readonly onNextTrace?: () => void
  readonly onPrevTrace?: () => void
  readonly canNavigateNext: boolean
  readonly canNavigatePrev: boolean
  /**
   * When true (default), trace tab + span selection sync to URL search params.
   * Set false for nested contexts (e.g. issue drawer overlay) so the parent route URL stays clean.
   */
  readonly urlSyncedTabs?: boolean
  /** Used when `urlSyncedTabs` is false; defaults to `"trace"`. */
  readonly initialTab?: TabId
  /** Overrides the default close control tooltip / screen-reader hint. */
  readonly closeLabel?: ReactNode
  /** LocalStorage key for persisted drawer width. */
  readonly drawerStoreKey?: string
  /** Active search query — drives literal/token highlights in the Conversation tab. */
  readonly searchQuery?: string
}

export function TraceDetailDrawer({ urlSyncedTabs = true, ...props }: TraceDetailDrawerProps) {
  if (urlSyncedTabs) {
    return <TraceDetailDrawerWithUrlTabs {...props} />
  }
  return <TraceDetailDrawerWithLocalTabs {...props} />
}

function TraceDetailDrawerWithUrlTabs(props: Omit<TraceDetailDrawerProps, "urlSyncedTabs">) {
  const { initialTab: _initialTabIgnored, closeLabel, drawerStoreKey, ...rest } = props
  // Shared with the session panel via the `detailTab` URL param so Conversation
  // / Annotations carry over when switching between trace and session views.
  const [activeTab, setActiveTab] = useParamState("detailTab", "trace", {
    validate: isTraceDetailTab,
  })
  const [selectedSpanId, setSelectedSpanId] = useParamState("spanId", "")
  return (
    <TraceDetailDrawerShell
      {...(rest as Omit<TraceDetailDrawerProps, "urlSyncedTabs" | "initialTab" | "closeLabel" | "drawerStoreKey">)}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      selectedSpanId={selectedSpanId}
      onSelectedSpanIdChange={setSelectedSpanId}
      {...(closeLabel !== undefined ? { closeLabel } : {})}
      {...(drawerStoreKey !== undefined ? { drawerStoreKey } : {})}
    />
  )
}

function TraceDetailDrawerWithLocalTabs(props: Omit<TraceDetailDrawerProps, "urlSyncedTabs">) {
  const { initialTab, closeLabel, drawerStoreKey, ...rest } = props
  const [activeTab, setActiveTab] = useState<TabId>(initialTab ?? "trace")
  const [selectedSpanId, setSelectedSpanId] = useState("")
  return (
    <TraceDetailDrawerShell
      {...(rest as Omit<TraceDetailDrawerProps, "urlSyncedTabs" | "initialTab" | "closeLabel" | "drawerStoreKey">)}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      selectedSpanId={selectedSpanId}
      onSelectedSpanIdChange={setSelectedSpanId}
      {...(closeLabel !== undefined ? { closeLabel } : {})}
      {...(drawerStoreKey !== undefined ? { drawerStoreKey } : {})}
    />
  )
}

type TraceDetailTabControlProps = {
  readonly activeTab: TabId
  readonly onActiveTabChange: (tab: TabId) => void
  readonly selectedSpanId: string
  readonly onSelectedSpanIdChange: (spanId: string) => void
}

export type TraceDetailBodyProps = {
  readonly traceId: string
  readonly trace?: TraceRecord | undefined
  readonly projectId: string
  readonly filters?: FilterSet | undefined
  readonly onFiltersChange?: (filters: FilterSet) => void
  readonly focusAnnotationId?: string
  /** Active search query — drives literal/token highlights in the Conversation tab. */
  readonly searchQuery?: string
} & TraceDetailTabControlProps

/**
 * The trace detail surface minus the `DetailDrawer` chrome (width, close
 * button, next/prev nav): the sticky header + the four tabs + the lazy-mounted
 * tab panes, plus the annotation scroll/flash wiring.
 *
 * Mounted two ways: by `TraceDetailDrawer` (its own `DetailDrawer` + next/prev
 * actions) and by the session panel's trace slot (no nested drawer, no
 * next/prev — the slot supplies a "← View session" back control instead).
 */
export function TraceDetailBody({
  traceId,
  trace,
  projectId,
  filters,
  onFiltersChange,
  activeTab,
  onActiveTabChange,
  selectedSpanId,
  onSelectedSpanIdChange,
  focusAnnotationId,
  searchQuery,
}: TraceDetailBodyProps) {
  const { data: traceDetail, isLoading: isDetailLoading } = useTraceDetail({
    projectId,
    traceId,
  })
  const {
    data: annotationsByTraceData,
    isLoading: annotationsByTraceLoading,
    isError: annotationsByTraceError,
  } = useAnnotationsByTrace({
    projectId,
    traceId,
    draftMode: "include",
  })
  const annotationCount = annotationsByTraceData?.items?.length ?? 0
  const annotationTabSuffix = useMemo(
    () =>
      getAnnotationTabSuffix({
        annotationsByTraceError,
        annotationsByTraceLoading,
        annotationCount,
      }),
    [annotationsByTraceError, annotationsByTraceLoading, annotationCount],
  )
  const isRecordLoading = !trace && !traceDetail
  const traceRecord: TraceRecord | undefined = traceDetail ?? trace
  const spansTabSuffix = useMemo(() => getSpansTabSuffix(traceRecord?.spanCount), [traceRecord?.spanCount])
  const tabsWithCounts = useMemo<TabOption<TabId>[]>(
    () =>
      TABS.map((tab) => {
        if (tab.id === "annotations") return { ...tab, suffix: annotationTabSuffix }
        if (tab.id === "spans") return { ...tab, suffix: spansTabSuffix }
        return tab
      }),
    [annotationTabSuffix, spansTabSuffix],
  )
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<TabId>>(() => new Set([activeTab]))

  const { scrollContainerRef, textSelectionPopoverControlsRef, scrollToAnnotation } = useConversationAnnotationFocus({
    projectId,
    traceId,
    focusAnnotationId,
    isConversationActive: activeTab === "conversation",
    onActivateConversation: () => handleSetActiveTab("conversation"),
  })

  useEffect(() => {
    setVisitedTabs((prev) => new Set([...prev, activeTab]))
  }, [activeTab])

  function handleSetActiveTab(tab: TabId) {
    onActiveTabChange(tab)
    setVisitedTabs((prev) => new Set([...prev, tab]))
  }

  function handleAnnotationClick(annotation: AnnotationRecord) {
    if (isGlobalAnnotation(annotation)) return
    scrollToAnnotation(annotation)
  }

  function navigateToSpan(spanId: string | null) {
    handleSetActiveTab("spans")
    onSelectedSpanIdChange(spanId ?? "")
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex flex-col px-6 py-4 gap-5 border-b shrink-0">
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
              <Status
                variant="destructive"
                indicator={false}
                label={`${formatCount(traceRecord.errorCount)} ${traceRecord.errorCount === 1 ? "error" : "errors"}`}
              />
            ) : null}
          </div>
          <CopyableText value={traceId} displayValue={traceId.slice(0, 7)} size="sm" tooltip="Copy trace ID" />
        </div>

        <Tabs options={tabsWithCounts} active={activeTab} onSelect={handleSetActiveTab} />
      </div>

      <div
        className={cn("flex flex-col flex-1 overflow-hidden", {
          hidden: activeTab !== "trace",
        })}
      >
        {visitedTabs.has("trace") && (
          <TraceTab
            traceId={traceId}
            projectId={projectId}
            traceRecord={traceRecord}
            traceDetail={traceDetail}
            isRecordLoading={isRecordLoading}
            isDetailLoading={isDetailLoading}
            filters={filters}
            onFiltersChange={onFiltersChange}
          />
        )}
      </div>
      <div
        className={cn("flex flex-col flex-1 overflow-hidden", {
          hidden: activeTab !== "conversation",
        })}
      >
        {visitedTabs.has("conversation") && (
          <ConversationTab
            traceDetail={traceDetail}
            isDetailLoading={isDetailLoading}
            navigateToSpan={navigateToSpan}
            projectId={projectId}
            isActive={activeTab === "conversation"}
            scrollContainerRef={scrollContainerRef}
            textSelectionPopoverControlsRef={textSelectionPopoverControlsRef}
            {...(searchQuery ? { searchQuery } : {})}
          />
        )}
      </div>
      <div
        className={cn("flex flex-col flex-1 overflow-hidden", {
          hidden: activeTab !== "spans",
        })}
      >
        {visitedTabs.has("spans") && (
          <SpansTab
            projectId={projectId}
            traceId={traceId}
            startTimeFrom={traceRecord?.startTime}
            startTimeTo={traceRecord?.endTime}
            selectedSpanId={selectedSpanId}
            onSelectSpan={navigateToSpan}
            isActive={activeTab === "spans"}
          />
        )}
      </div>
      <div
        className={cn("flex flex-col flex-1 overflow-hidden", {
          hidden: activeTab !== "annotations",
        })}
      >
        {visitedTabs.has("annotations") && (
          <TraceAnnotationsList
            projectId={projectId}
            traceId={traceId}
            hideAnnotationIntro
            onAnnotationClick={handleAnnotationClick}
          />
        )}
      </div>
    </div>
  )
}

function TraceDetailDrawerShell({
  traceId,
  trace,
  projectId,
  filters,
  onFiltersChange,
  onClose,
  onNextTrace,
  onPrevTrace,
  canNavigateNext,
  canNavigatePrev,
  activeTab,
  onActiveTabChange,
  selectedSpanId,
  onSelectedSpanIdChange,
  closeLabel,
  drawerStoreKey = "trace-detail-drawer-width",
  searchQuery,
}: Omit<TraceDetailDrawerProps, "urlSyncedTabs" | "initialTab" | "closeLabel" | "drawerStoreKey"> &
  TraceDetailTabControlProps & {
    readonly closeLabel?: ReactNode
    readonly drawerStoreKey?: string
  }) {
  useHotkeys([
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
      storeKey={drawerStoreKey}
      onClose={onClose}
      closeLabel={
        closeLabel ?? (
          <>
            Close <HotkeyBadge hotkey="Escape" />
          </>
        )
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
    >
      <TraceDetailBody
        traceId={traceId}
        trace={trace}
        projectId={projectId}
        filters={filters}
        {...(onFiltersChange ? { onFiltersChange } : {})}
        activeTab={activeTab}
        onActiveTabChange={onActiveTabChange}
        selectedSpanId={selectedSpanId}
        onSelectedSpanIdChange={onSelectedSpanIdChange}
        {...(searchQuery ? { searchQuery } : {})}
      />
    </DetailDrawer>
  )
}
