import type { MomentKind } from "@domain/conversation-intelligence"
import type { FilterSet } from "@domain/shared"
import { CopyableText, Icon, ProviderIcon, Status, type TabOption, Tabs, Text, Tooltip } from "@repo/ui"
import { formatCount, relativeTime } from "@repo/utils"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { GaugeIcon, GroupIcon, ListTreeIcon, MessagesSquareIcon, ShieldAlertIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useProjectScope } from "../../../../../../domains/projects/project-scope.tsx"
import { useScoresBySession } from "../../../../../../domains/scores/scores.collection.ts"
import { deriveSessionStatus, useSessionSignals } from "../../../../../../domains/sessions/sessions.collection.ts"
import type { SessionDetailRecord } from "../../../../../../domains/sessions/sessions.functions.ts"
import type { TraceRecord } from "../../../../../../domains/traces/traces.functions.ts"
import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import { AddTraceToDatasetAction } from "../add-trace-to-dataset-action.tsx"
import { MemorySummaryChip } from "../memory-summary-chip.tsx"
import type { OpenTraceOptions } from "../session-detail-drawer.tsx"
import type { SpanTreeSelection } from "../trace-detail-drawer/tabs/spans-tab/span-tree/index.tsx"
import { useSpanFilters } from "../trace-detail-drawer/tabs/spans-tab/use-span-filters.ts"
import { ConversationTab } from "./conversation-tab.tsx"
import { MetadataTab } from "./metadata-tab.tsx"
import { ScoresTab } from "./scores-tab.tsx"
import { SessionSpansTab } from "./session-spans-tab.tsx"
import { SessionStatusPill } from "./session-status-pill.tsx"
import { SignalsTab } from "./signals-tab.tsx"

export type SessionTabId = "session" | "conversation" | "spans" | "scores" | "issues"

export function isSessionTab(value: string): value is SessionTabId {
  if (value === "annotations") return true
  return (
    value === "session" || value === "conversation" || value === "spans" || value === "scores" || value === "issues"
  )
}

export function normalizeSessionTab(value: string): SessionTabId {
  if (value === "annotations") return "scores"
  return isSessionTab(value) ? value : "session"
}

const tabCountPillClass =
  "inline-flex min-h-5 min-w-[1.125rem] shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-[0.6875rem] font-medium leading-none text-muted-foreground tabular-nums"

function countSuffix(count: number) {
  if (count <= 0) return null
  return <span className={tabCountPillClass}>{count}</span>
}

export function SessionSlot({
  projectId,
  session,
  traces,
  latestTraceId,
  activeTab,
  onActiveTabChange,
  isActive,
  onOpenTrace,
  onOpenSignal,
  onOpenInConversation,
  searchQuery,
  filters,
  onFiltersChange,
  focusMomentKind,
  focusMomentId,
}: {
  readonly projectId: string
  readonly session: SessionDetailRecord
  readonly traces: readonly TraceRecord[]
  readonly latestTraceId: string
  readonly activeTab: SessionTabId
  readonly onActiveTabChange: (tab: SessionTabId) => void
  /** False while a trace/issue slot is shown — suppresses the H/L tab hotkeys so they don't fight the trace slot. */
  readonly isActive: boolean
  readonly onOpenTrace: (traceId: string, options?: OpenTraceOptions) => void
  readonly onOpenSignal: (signalId: string) => void
  readonly onOpenInConversation: (annotationId: string) => void
  readonly searchQuery?: string
  readonly filters?: FilterSet | undefined
  readonly onFiltersChange?: ((filters: FilterSet) => void) | undefined
  /** Scrolls the Conversation tab to the first moment carrying this label kind. */
  readonly focusMomentKind?: MomentKind | undefined
  /** Scrolls the Conversation tab to this semantic moment (no label required). */
  readonly focusMomentId?: string | undefined
}) {
  const traceIds = session.traceIds

  // Annotations and issues are analysis/feedback features the sandbox doesn't
  // produce — both off under a sandbox scope: hide the tabs and skip the fetches.
  const isSandbox = useProjectScope().kind === "sandbox"
  const scoresEnabled = !isSandbox
  const signalsEnabled = !isSandbox
  const [selectedSpanId, setSelectedSpanId] = useParamState("spanId", "")
  const [selectedSpanTraceId, setSelectedSpanTraceId] = useParamState("spanTraceId", "")
  const { openWithErrors, openWithModel } = useSpanFilters()
  const requestedTab = normalizeSessionTab(activeTab)
  // A deep-linked tab for a feature that's off (sandbox) falls back to Session.
  const effectiveActiveTab: SessionTabId =
    (requestedTab === "scores" && !scoresEnabled) || (requestedTab === "issues" && !signalsEnabled)
      ? "session"
      : requestedTab
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<SessionTabId>>(() => new Set([effectiveActiveTab]))

  // TODO(frontend-use-effect-policy): visited-set is an accumulator over a
  // sequence of activeTab changes; can't be derived from current props alone.
  useEffect(() => {
    setVisitedTabs((prev) => (prev.has(effectiveActiveTab) ? prev : new Set([...prev, effectiveActiveTab])))
  }, [effectiveActiveTab])

  function selectTab(tab: SessionTabId) {
    onActiveTabChange(tab)
  }

  function navigateToSpansWithErrors() {
    openWithErrors()
    selectSpan(null)
    onActiveTabChange("spans")
  }

  function navigateToSpansWithModel(model: string) {
    openWithModel(model)
    selectSpan(null)
    onActiveTabChange("spans")
  }

  function navigateToSpan(spanId: string, traceId?: string) {
    // Conversation span links carry their trace (span ids are trace-scoped, so a
    // bare span id collides across a session's traces). Fall back to letting
    // SessionSpansTab resolve the trace when a caller omits it.
    setSelectedSpanTraceId(traceId ?? "")
    setSelectedSpanId(spanId)
    onActiveTabChange("spans")
  }

  function selectSpan(selection: SpanTreeSelection | null) {
    setSelectedSpanTraceId(selection?.traceId ?? "")
    setSelectedSpanId(selection?.spanId ?? "")
  }

  // Badge counts. Both queries are shared (same key) with the tab panes, so
  // mounting a tab doesn't refetch.
  const { data: scoresData } = useScoresBySession({
    projectId,
    traceIds,
    enabled: scoresEnabled,
  })
  const { data: issues } = useSessionSignals({ projectId, traceIds, enabled: signalsEnabled })
  const scoreCount = scoresData?.items.length ?? 0
  const signalCount = issues?.length ?? 0

  const traceNumberById = useMemo(() => {
    const map = new Map<string, number>()
    // `traces` arrives newest-first; "Trace N" stays chronological (1 = oldest)
    // so labels don't shift as new traces land.
    for (let index = 0; index < traces.length; index++) {
      const trace = traces[index]
      if (trace) map.set(trace.traceId, traces.length - index)
    }
    return map
  }, [traces])

  const tabs = useMemo<TabOption<SessionTabId>[]>(() => {
    const all: TabOption<SessionTabId>[] = [
      {
        id: "session",
        label: "Session",
        icon: <Icon icon={GroupIcon} size="sm" />,
      },
      {
        id: "conversation",
        label: "Conversation",
        icon: <Icon icon={MessagesSquareIcon} size="sm" />,
      },
    ]
    all.push({
      id: "spans",
      label: "Spans",
      icon: <Icon icon={ListTreeIcon} size="sm" />,
      suffix: countSuffix(session.spanCount),
    })
    if (scoresEnabled) {
      all.push({
        id: "scores",
        label: "Scores",
        icon: <Icon icon={GaugeIcon} size="sm" />,
        suffix: countSuffix(scoreCount),
      })
    }
    if (signalsEnabled) {
      all.push({
        id: "issues",
        label: "Signals",
        icon: <Icon icon={ShieldAlertIcon} size="sm" />,
        suffix: countSuffix(signalCount),
      })
    }
    return all
  }, [scoresEnabled, session.spanCount, signalsEnabled, scoreCount, signalCount])

  // H/L cycle the session tabs (wrapping), matching the trace drawer. Disabled
  // while a trace/issue slot is shown so they don't collide with the trace slot.
  const tabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs])
  useHotkeys([
    {
      hotkey: "L",
      callback: () => {
        const idx = tabIds.indexOf(effectiveActiveTab)
        const next = tabIds[(idx + 1) % tabIds.length]
        if (next) selectTab(next)
      },
      options: { enabled: isActive },
    },
    {
      hotkey: "H",
      callback: () => {
        const idx = tabIds.indexOf(effectiveActiveTab)
        const prev = tabIds[(idx - 1 + tabIds.length) % tabIds.length]
        if (prev) selectTab(prev)
      },
      options: { enabled: isActive },
    },
  ])

  const title = session.rootSpanName || session.sessionId.slice(0, 12)
  const status = deriveSessionStatus(session.endTime)
  // Prefer the latest output trace; fall back to any trace so sessions whose
  // spans have no output messages (latestTraceId === "") can still be added.
  const datasetTraceId = latestTraceId || session.traceIds[0]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-5 border-b px-6 py-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-row items-center gap-2">
            <Text.H4 ellipsis noWrap>
              {title}
            </Text.H4>
            {session.providers.length > 0 && (
              <div className="flex items-center gap-1">
                {session.providers.map((p) => (
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
            <SessionStatusPill status={status} lastActivity={relativeTime(new Date(session.endTime))} />
            {session.errorCount > 0 ? (
              <button
                type="button"
                onClick={navigateToSpansWithErrors}
                aria-label={`View ${session.errorCount} errored spans`}
                className="inline-flex shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Status
                  variant="destructive"
                  indicator={false}
                  label={`${formatCount(session.errorCount)} ${session.errorCount === 1 ? "error" : "errors"}`}
                  className="cursor-pointer transition-opacity hover:opacity-80"
                />
              </button>
            ) : null}
            <MemorySummaryChip projectId={projectId} sessionId={session.sessionId} />
            {!isSandbox && datasetTraceId ? (
              <div className="ml-auto shrink-0">
                <AddTraceToDatasetAction
                  projectId={projectId}
                  traceId={datasetTraceId}
                  description={`Adding ${latestTraceId ? "the latest" : "a"} trace of this session · ${datasetTraceId.slice(0, 7)}`}
                />
              </div>
            ) : null}
          </div>
          <CopyableText
            value={session.sessionId}
            displayValue={session.sessionId.slice(0, 7)}
            size="sm"
            tooltip="Copy session ID"
          />
        </div>
        <Tabs options={tabs} active={effectiveActiveTab} onSelect={selectTab} wrap />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {effectiveActiveTab === "session" && (
          <MetadataTab
            session={session}
            spansNavEnabled
            onOpenSpansWithModel={navigateToSpansWithModel}
            {...(filters ? { filters } : {})}
            {...(onFiltersChange ? { onFiltersChange } : {})}
          />
        )}
        {visitedTabs.has("conversation") && (
          <div className={effectiveActiveTab === "conversation" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <ConversationTab
              projectId={projectId}
              session={session}
              traces={traces}
              latestTraceId={latestTraceId}
              isActive={effectiveActiveTab === "conversation"}
              focusMomentKind={focusMomentKind}
              focusMomentId={focusMomentId}
              {...(latestTraceId ? { navigateToSpan } : {})}
              {...(searchQuery ? { searchQuery } : {})}
            />
          </div>
        )}
        {visitedTabs.has("spans") && (
          <div className={effectiveActiveTab === "spans" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <SessionSpansTab
              projectId={projectId}
              session={session}
              traces={traces}
              selectedSpanId={selectedSpanId}
              selectedSpanTraceId={selectedSpanTraceId}
              onSelectSpan={selectSpan}
              onOpenTrace={onOpenTrace}
              isActive={effectiveActiveTab === "spans"}
            />
          </div>
        )}
        {scoresEnabled && visitedTabs.has("scores") && (
          <div className={effectiveActiveTab === "scores" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <ScoresTab
              projectId={projectId}
              traceIds={traceIds}
              latestTraceId={latestTraceId}
              traceNumberById={traceNumberById}
              onOpenInConversation={onOpenInConversation}
              onOpenTrace={onOpenTrace}
            />
          </div>
        )}
        {signalsEnabled && visitedTabs.has("issues") && (
          <div className={effectiveActiveTab === "issues" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <SignalsTab projectId={projectId} traceIds={traceIds} onOpenSignal={onOpenSignal} />
          </div>
        )}
      </div>
    </div>
  )
}
