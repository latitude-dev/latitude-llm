import type { MomentKind } from "@domain/conversation-intelligence"
import { Button, Icon, Popover, PopoverClose, PopoverContent, PopoverTrigger, Text } from "@repo/ui"
import { XIcon } from "lucide-react"
import { type ReactNode, useCallback, useMemo, useState, useSyncExternalStore } from "react"
import { useProjectScope } from "../../../../../../domains/projects/project-scope.tsx"
import type { SessionDetailRecord } from "../../../../../../domains/sessions/sessions.functions.ts"
import { useSpansBySessionCollection } from "../../../../../../domains/spans/spans.collection.ts"
import {
  useSessionMomentIntelligence,
  useTraceConversationMessages,
} from "../../../../../../domains/traces/traces.collection.ts"
import type { SessionMomentIntelligenceRecord, TraceRecord } from "../../../../../../domains/traces/traces.functions.ts"
import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import { useConversationAnnotationFocus } from "../annotations/hooks/use-conversation-annotation-focus.ts"
import { useSessionTimeline } from "../conversation-timeline/use-session-timeline.ts"
import { ConversationTab as TraceConversationTab } from "../trace-detail-drawer/tabs/conversation-tab.tsx"
import { useAgentGraph } from "./agents-breakdown/use-agent-graph.ts"
import { isLargeSession } from "./session-size.ts"
import { useScrollToFocusedMoment } from "./use-scroll-to-focused-moment.ts"

type MomentLabelRecord = SessionMomentIntelligenceRecord["labels"][number]

function capitalizeMomentKind(kind: string) {
  const label = kind.replaceAll("_", " ")
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// Older analyses baked the detector version into the stored summary; strip it
// for display (newer analyses no longer write it).
const displayLabelSummary = (summary: string) => summary.replace(/\s*\(moment-label-anchors-v\d+\)$/, "")

function SessionConversationVisuals({
  projectId,
  session,
  traces,
  latestTraceId,
  annotationsEnabled,
  moments,
  children,
}: {
  readonly projectId: string
  readonly session: SessionDetailRecord
  readonly traces: readonly TraceRecord[]
  readonly latestTraceId: string
  readonly annotationsEnabled: boolean
  readonly moments: readonly {
    readonly id: string
    readonly messageIndex: number
    readonly kind: string
    readonly summary: string
    readonly confidence: number
  }[]
  readonly children: (visuals: {
    readonly timeline: ReturnType<typeof useSessionTimeline>
    readonly sessionSpans: ReturnType<typeof useSpansBySessionCollection>["data"]
    readonly agentGraph: ReturnType<typeof useAgentGraph>
  }) => ReactNode
}) {
  const { data: sessionSpans } = useSpansBySessionCollection({
    projectId,
    sessionId: session.sessionId,
    traceIds: session.traceIds,
    startTimeFrom: session.startTime,
    startTimeTo: session.endTime,
  })
  const agentGraph = useAgentGraph(sessionSpans)
  const timeline = useSessionTimeline({
    projectId,
    session,
    traces,
    latestTraceId,
    annotationsEnabled,
    moments,
  })

  return children({ timeline, sessionSpans, agentGraph })
}

function MomentLabelEvidence({ label }: { readonly label: MomentLabelRecord }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Text.H4>{capitalizeMomentKind(label.kind)}</Text.H4>
        <Text.H6 color="foregroundMuted">Confidence {Math.round(label.confidence * 100)}%</Text.H6>
      </div>
      <div className="flex flex-col gap-1.5">
        <Text.H6 color="foregroundMuted">Summary</Text.H6>
        <Text.H5>{displayLabelSummary(label.summary)}</Text.H5>
      </div>
      <div className="flex flex-col gap-1.5">
        <Text.H6 color="foregroundMuted">Evidence</Text.H6>
        <Text.H5 className="italic">“{label.evidence}”</Text.H5>
      </div>
    </div>
  )
}

/**
 * Selected-label state lives outside React render state on purpose: the
 * badges render inside `messageTrailingSlot`, and threading the selection
 * through props would re-render the whole conversation (every markdown
 * message) on each badge click — visibly delaying the popover and eating
 * its open animation. With a store + `useSyncExternalStore`, a click only
 * re-renders the two badges whose open state actually flips.
 */
interface SelectedLabelStore {
  readonly get: () => string | null
  readonly set: (labelId: string | null) => void
  readonly subscribe: (listener: () => void) => () => void
}

function useSelectedLabelStore(): SelectedLabelStore {
  const [store] = useState((): SelectedLabelStore => {
    let value: string | null = null
    const listeners = new Set<() => void>()
    return {
      get: () => value,
      set: (labelId) => {
        if (value === labelId) return
        value = labelId
        for (const listener of listeners) listener()
      },
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
  })
  return store
}

function MomentLabelBadge({ label, store }: { readonly label: MomentLabelRecord; readonly store: SelectedLabelStore }) {
  const open = useSyncExternalStore(store.subscribe, () => store.get() === label.labelId)
  return (
    <Popover open={open} onOpenChange={(nextOpen) => store.set(nextOpen ? label.labelId : null)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex max-w-48 cursor-pointer items-center rounded-full border border-border bg-muted px-2 py-0.5 text-muted-foreground text-xs hover:bg-muted/70 data-[state=open]:border-primary data-[state=open]:bg-primary/10"
          title="Show moment evidence"
          onClick={(event) => event.stopPropagation()}
        >
          {label.kind.replaceAll("_", " ")}
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-96 max-w-[calc(100vw-2rem)]">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <MomentLabelEvidence label={label} />
          </div>
          <PopoverClose asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Close moment">
              <Icon icon={XIcon} size="sm" />
            </Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The session Conversation tab renders the latest ingested trace's
 * conversation (with that trace's inline annotations) by mounting the existing
 * trace ConversationTab against `latestTraceId`. Reusing the full trace keeps
 * inline annotation anchoring (`messageIndex`) exact. When the Scores tab
 * focuses a score on the latest trace (which writes the `scoreId` param and
 * switches here) the conversation scrolls to + opens that annotation.
 *
 * Detected moment labels from the session analysis render as badges anchored
 * below the exact message that triggered the detection. When opened with a
 * `focusMomentKind` (e.g. from a behaviour's detected-signal filter) the
 * conversation scrolls to the first moment carrying that label.
 */
export function ConversationTab({
  projectId,
  session,
  traces,
  latestTraceId,
  isActive,
  searchQuery,
  focusMomentKind,
  focusMomentId,
  navigateToSpan,
}: {
  readonly projectId: string
  readonly session: SessionDetailRecord
  readonly traces: readonly TraceRecord[]
  readonly latestTraceId: string
  readonly isActive: boolean
  readonly searchQuery?: string
  readonly focusMomentKind?: MomentKind | undefined
  /** Scrolls to this semantic moment when no label kind is focused. */
  readonly focusMomentId?: string | undefined
  /** Navigates to a span in the session Spans tab; enables the conversation's span-link affordances. */
  readonly navigateToSpan?: ((spanId: string, traceId?: string) => void) | undefined
}) {
  const sessionId = session.sessionId
  const largeSession = isLargeSession(session)
  // Annotations are an LLM-feedback feature — off under a sandbox scope.
  const annotationsEnabled = useProjectScope().kind === "live"
  const { data: moments } = useSessionMomentIntelligence({ projectId, sessionId })

  const timelineMoments = useMemo(
    () =>
      (moments ?? []).flatMap((row) =>
        row.labels.map((label) => ({
          id: label.labelId,
          messageIndex: label.lastMessageIndex,
          kind: capitalizeMomentKind(label.kind),
          summary: displayLabelSummary(label.summary),
          confidence: label.confidence,
        })),
      ),
    [moments],
  )

  const [focusScoreId] = useParamState("scoreId", "")
  const selectedLabelStore = useSelectedLabelStore()
  const { scrollContainerRef, textSelectionPopoverControlsRef, traceDetail, isDetailLoading } =
    useConversationAnnotationFocus({
      projectId,
      traceId: latestTraceId,
      focusScoreId,
      isConversationActive: isActive,
      annotationsEnabled,
    })
  const conversation = useTraceConversationMessages({
    projectId,
    traceId: latestTraceId,
    enabled: traceDetail != null,
  })

  // Labels are scored per turn, so each badge anchors to the exact message
  // that triggered the detection (label.lastMessageIndex), not the end of the
  // surrounding semantic moment — the two can be several messages apart.
  const labelsByMessageIndex = useMemo(() => {
    const map = new Map<number, MomentLabelRecord[]>()
    for (const row of moments ?? []) {
      for (const label of row.labels) {
        const existing = map.get(label.lastMessageIndex)
        if (existing) existing.push(label)
        else map.set(label.lastMessageIndex, [label])
      }
    }
    return map
  }, [moments])

  const focusMessageIndex = useMemo(() => {
    if (!moments) return undefined
    if (focusMomentKind) {
      return moments
        .find((row) => row.labels.some((label) => label.kind === focusMomentKind))
        ?.labels.find((label) => label.kind === focusMomentKind)?.lastMessageIndex
    }
    if (focusMomentId) {
      return moments.find((row) => row.moment.momentId === focusMomentId)?.moment.firstMessageIndex
    }
    return undefined
  }, [focusMomentId, focusMomentKind, moments])

  useScrollToFocusedMoment({
    scrollRef: scrollContainerRef,
    sessionId,
    focusMomentKind,
    focusMomentId,
    moments,
    isActive,
    isConversationReady: !isDetailLoading && traceDetail != null,
    loadedMessageCount: conversation.messages.length,
    onFocused: selectedLabelStore.set,
  })

  // Stable across label selection changes — see `useSelectedLabelStore`.
  const messageTrailingSlot = useCallback(
    (messageIndex: number) => {
      const labels = labelsByMessageIndex.get(messageIndex)
      if (!labels) return null
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {labels.map((label) => (
            <MomentLabelBadge key={label.labelId} label={label} store={selectedLabelStore} />
          ))}
        </div>
      )
    },
    [labelsByMessageIndex, selectedLabelStore],
  )

  if (!latestTraceId) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <Text.H5 color="foregroundMuted">No conversation in this session.</Text.H5>
      </div>
    )
  }

  const conversationProps = {
    traceDetail,
    isDetailLoading,
    projectId,
    isActive,
    annotationsEnabled,
    scrollContainerRef,
    textSelectionPopoverControlsRef,
    focusMessageIndex,
    ...(navigateToSpan && !largeSession ? { navigateToSpan } : {}),
    ...(labelsByMessageIndex.size > 0 ? { messageTrailingSlot } : {}),
    ...(searchQuery ? { searchQuery } : {}),
  }

  if (largeSession) {
    return (
      <TraceConversationTab
        {...conversationProps}
        timelineNotice="Timeline hidden for large sessions. Open an individual trace to inspect its timeline."
      />
    )
  }

  return (
    <SessionConversationVisuals
      projectId={projectId}
      session={session}
      traces={traces}
      latestTraceId={latestTraceId}
      annotationsEnabled={annotationsEnabled}
      moments={timelineMoments}
    >
      {({ timeline, sessionSpans, agentGraph }) => (
        <TraceConversationTab
          {...conversationProps}
          timeline={timeline}
          sessionSpanScope={{ traces, sessionSpans: sessionSpans ?? [] }}
          agentGraph={agentGraph}
        />
      )}
    </SessionConversationVisuals>
  )
}
