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
import { ArrowDownIcon, ArrowUpIcon, GaugeIcon, GroupIcon, ListTreeIcon, MessagesSquareIcon } from "lucide-react"
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import { HotkeyBadge } from "../../../../../components/hotkey-badge.tsx"
import type { AnnotationRecord } from "../../../../../domains/annotations/annotations.functions.ts"
import { useProjectScope } from "../../../../../domains/projects/project-scope.tsx"
import { useScoresByTrace } from "../../../../../domains/scores/scores.collection.ts"
import type { ScoreRecord } from "../../../../../domains/scores/scores.functions.ts"
import { useSpansByTraceCollection } from "../../../../../domains/spans/spans.collection.ts"
import { useTraceDetail } from "../../../../../domains/traces/traces.collection.ts"
import type { TraceRecord } from "../../../../../domains/traces/traces.functions.ts"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { AddTraceToDatasetAction } from "./add-trace-to-dataset-action.tsx"
import { isGlobalAnnotation } from "./annotations/hooks/use-annotation-navigation.ts"
import { useConversationAnnotationFocus } from "./annotations/hooks/use-conversation-annotation-focus.ts"
import { useTraceTimeline } from "./conversation-timeline/use-trace-timeline.ts"
import { MemorySummaryChip } from "./memory-summary-chip.tsx"
import { TraceScoresList } from "./scores/trace-scores-list.tsx"
import { ConversationTab } from "./trace-detail-drawer/tabs/conversation-tab.tsx"
import { useSpanFilters } from "./trace-detail-drawer/tabs/spans-tab/use-span-filters.ts"
import { SpansTab } from "./trace-detail-drawer/tabs/spans-tab.tsx"
import { TraceTab } from "./trace-detail-drawer/tabs/trace-tab.tsx"
import { TraceCommandPaletteContributor } from "./trace-detail-drawer/trace-command-palette-contributor.tsx"

export type TraceDetailTabId = "trace" | "conversation" | "spans" | "scores"

export function isTraceDetailTab(value: string): value is TraceDetailTabId {
  if (value === "annotations") return true
  return value === "trace" || value === "conversation" || value === "spans" || value === "scores"
}

export function normalizeTraceDetailTab(value: string): TraceDetailTabId {
  if (value === "annotations") return "scores"
  return isTraceDetailTab(value) ? value : "trace"
}

type TabId = TraceDetailTabId

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
    id: "scores",
    label: "Scores",
    icon: <Icon icon={GaugeIcon} size="sm" />,
  },
]

const tabCountPillClass =
  "inline-flex min-h-5 min-w-[1.125rem] shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-[0.6875rem] font-medium leading-none text-muted-foreground"

function getScoresTabSuffix({
  scoresByTraceError,
  scoresByTraceLoading,
  scoreCount,
}: {
  readonly scoresByTraceError: boolean
  readonly scoresByTraceLoading: boolean
  readonly scoreCount: number
}): ReactNode {
  if (scoresByTraceError) {
    return <span className={tabCountPillClass}>–</span>
  }
  if (scoresByTraceLoading) {
    return null
  }
  if (scoreCount === 0) {
    return null
  }
  return <span className={cn(tabCountPillClass, "tabular-nums")}>{scoreCount}</span>
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
  /** Pre-selects a span when `urlSyncedTabs` is false; pair with `initialTab="spans"`. */
  readonly initialSpanId?: string
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
  const {
    initialTab: _initialTabIgnored,
    initialSpanId: _initialSpanIdIgnored,
    closeLabel,
    drawerStoreKey,
    ...rest
  } = props
  // Shared with the session panel via the `detailTab` URL param so Conversation
  // / Annotations carry over when switching between trace and session views.
  // Default to Conversation when arriving from an active search so the
  // search-match autoscroll/highlight lands on a hit instead of the trace tab.
  const defaultTab = (props.searchQuery?.length ?? 0) > 0 ? "conversation" : "trace"
  const [rawActiveTab, setActiveTab] = useParamState("detailTab", defaultTab, {
    validate: isTraceDetailTab,
  })
  const activeTab = normalizeTraceDetailTab(rawActiveTab)
  const [selectedSpanId, setSelectedSpanId] = useParamState("spanId", "")
  return (
    <TraceDetailDrawerShell
      {...(rest as Omit<
        TraceDetailDrawerProps,
        "urlSyncedTabs" | "initialTab" | "initialSpanId" | "closeLabel" | "drawerStoreKey"
      >)}
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
  const { initialTab, initialSpanId, closeLabel, drawerStoreKey, ...rest } = props
  const [activeTab, setActiveTab] = useState<TabId>(normalizeTraceDetailTab(initialTab ?? "trace"))
  const [selectedSpanId, setSelectedSpanId] = useState(initialSpanId ?? "")
  return (
    <TraceDetailDrawerShell
      {...(rest as Omit<
        TraceDetailDrawerProps,
        "urlSyncedTabs" | "initialTab" | "initialSpanId" | "closeLabel" | "drawerStoreKey"
      >)}
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
  const isSandbox = useProjectScope().kind === "sandbox"
  const scoresEnabled = !isSandbox
  const commandPaletteEnabled = !isSandbox
  const { data: traceDetail, isLoading: isDetailLoading } = useTraceDetail({
    projectId,
    traceId,
  })
  const {
    data: scoresByTraceData,
    isLoading: scoresByTraceLoading,
    isError: scoresByTraceError,
  } = useScoresByTrace({
    projectId,
    traceId,
    draftMode: "include",
    enabled: scoresEnabled,
  })
  const scoreCount = scoresByTraceData?.items?.length ?? 0
  const scoresTabSuffix = useMemo(
    () =>
      getScoresTabSuffix({
        scoresByTraceError,
        scoresByTraceLoading,
        scoreCount,
      }),
    [scoresByTraceError, scoresByTraceLoading, scoreCount],
  )
  const isRecordLoading = !trace && !traceDetail
  const traceRecord: TraceRecord | undefined = traceDetail ?? trace
  // Span list for the Trace tab's duration composition. The Spans tab fetches
  // with the same key, so the cached collection dedupes both into one fetch.
  const { data: spans, isLoading: isSpansLoading } = useSpansByTraceCollection({
    projectId,
    traceId,
    startTimeFrom: traceRecord?.startTime,
    startTimeTo: traceRecord?.endTime,
  })
  const spansTabSuffix = useMemo(() => getSpansTabSuffix(traceRecord?.spanCount), [traceRecord?.spanCount])
  const tabsWithCounts = useMemo<TabOption<TabId>[]>(
    () =>
      TABS.filter((tab) => scoresEnabled || tab.id !== "scores").map((tab) => {
        if (tab.id === "scores") return { ...tab, suffix: scoresTabSuffix }
        if (tab.id === "spans") return { ...tab, suffix: spansTabSuffix }
        return tab
      }),
    [scoresEnabled, scoresTabSuffix, spansTabSuffix],
  )
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<TabId>>(() => new Set([activeTab]))
  const { openWithErrors, openWithModel } = useSpanFilters()

  // Stable so the palette contributor's command memo doesn't re-register each render.
  const handleSetActiveTab = useCallback(
    (tab: TabId) => {
      onActiveTabChange(tab)
      setVisitedTabs((prev) => new Set([...prev, tab]))
    },
    [onActiveTabChange],
  )

  const timeline = useTraceTimeline({
    projectId,
    traceId,
    traceRecord,
    traceDetail,
    spans,
    annotationsEnabled: scoresEnabled,
  })

  // H/L cycle the trace tabs (J/K are reserved for prev/next trace and, on the
  // spans tab, the span tree). Wraps around, matching the tablist arrow keys.
  const tabIds = useMemo(() => tabsWithCounts.map((tab) => tab.id), [tabsWithCounts])
  useHotkeys([
    {
      hotkey: "L",
      callback: () => {
        const idx = tabIds.indexOf(activeTab)
        const next = tabIds[(idx + 1) % tabIds.length]
        if (next) handleSetActiveTab(next)
      },
    },
    {
      hotkey: "H",
      callback: () => {
        const idx = tabIds.indexOf(activeTab)
        const prev = tabIds[(idx - 1 + tabIds.length) % tabIds.length]
        if (prev) handleSetActiveTab(prev)
      },
    },
  ])

  const { scrollContainerRef, textSelectionPopoverControlsRef, scrollToAnnotation } = useConversationAnnotationFocus({
    projectId,
    traceId,
    focusAnnotationId,
    isConversationActive: activeTab === "conversation",
    onActivateConversation: () => handleSetActiveTab("conversation"),
    annotationsEnabled: scoresEnabled,
  })

  useEffect(() => {
    setVisitedTabs((prev) => new Set([...prev, activeTab]))
  }, [activeTab])

  function handleScoreClick(score: ScoreRecord) {
    if (score.source !== "annotation") return
    const annotation = score as AnnotationRecord
    if (isGlobalAnnotation(annotation)) return
    scrollToAnnotation(annotation)
  }

  function navigateToSpan(spanId: string | null) {
    handleSetActiveTab("spans")
    onSelectedSpanIdChange(spanId ?? "")
  }

  function navigateToSpansWithErrors() {
    openWithErrors()
    onSelectedSpanIdChange("")
    handleSetActiveTab("spans")
  }

  function navigateToSpansWithModel(model: string) {
    openWithModel(model)
    onSelectedSpanIdChange("")
    handleSetActiveTab("spans")
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {commandPaletteEnabled ? (
        <TraceCommandPaletteContributor traceId={traceId} traceRecord={traceRecord} onGoToTab={handleSetActiveTab} />
      ) : null}
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
              <button
                type="button"
                onClick={navigateToSpansWithErrors}
                aria-label={`View ${traceRecord.errorCount} errored spans`}
                className="inline-flex shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Status
                  variant="destructive"
                  indicator={false}
                  label={`${formatCount(traceRecord.errorCount)} ${traceRecord.errorCount === 1 ? "error" : "errors"}`}
                  className="cursor-pointer transition-opacity hover:opacity-80"
                />
              </button>
            ) : null}
            {traceRecord?.sessionId ? (
              <MemorySummaryChip projectId={projectId} sessionId={traceRecord.sessionId} traceId={traceId} />
            ) : null}
            {!isSandbox ? (
              <div className="ml-auto shrink-0">
                <AddTraceToDatasetAction projectId={projectId} traceId={traceId} />
              </div>
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
            spans={spans}
            isSpansLoading={isSpansLoading}
            isRecordLoading={isRecordLoading}
            isDetailLoading={isDetailLoading}
            onOpenSpansWithModel={navigateToSpansWithModel}
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
            annotationsEnabled={scoresEnabled}
            scrollContainerRef={scrollContainerRef}
            textSelectionPopoverControlsRef={textSelectionPopoverControlsRef}
            timeline={timeline}
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
      {scoresEnabled ? (
        <div
          className={cn("flex flex-col flex-1 overflow-hidden", {
            hidden: activeTab !== "scores",
          })}
        >
          {visitedTabs.has("scores") && (
            <TraceScoresList projectId={projectId} traceId={traceId} hideIntro onScoreClick={handleScoreClick} />
          )}
        </div>
      ) : null}
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
            Next trace <HotkeyBadge hotkey="J" />
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
            Previous trace <HotkeyBadge hotkey="K" />
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
