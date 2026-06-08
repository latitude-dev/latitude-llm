import type { MomentKind } from "@domain/conversation-intelligence"
import { Button, Icon, Popover, PopoverClose, PopoverContent, PopoverTrigger, Text } from "@repo/ui"
import { XIcon } from "lucide-react"
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useSessionMomentIntelligence } from "../../../../../../domains/traces/traces.collection.ts"
import type { SessionMomentIntelligenceRecord } from "../../../../../../domains/traces/traces.functions.ts"
import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import { useConversationAnnotationFocus } from "../annotations/hooks/use-conversation-annotation-focus.ts"
import { ConversationTab as TraceConversationTab } from "../trace-detail-drawer/tabs/conversation-tab.tsx"

const MOMENT_FOCUS_OBSERVER_TIMEOUT_MS = 2000

type MomentLabelRecord = SessionMomentIntelligenceRecord["labels"][number]

function capitalizeMomentKind(kind: string) {
  const label = kind.replaceAll("_", " ")
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// Older analyses baked the detector version into the stored summary; strip it
// for display (newer analyses no longer write it).
const displayLabelSummary = (summary: string) => summary.replace(/\s*\(moment-label-anchors-v\d+\)$/, "")

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
      <PopoverContent side="bottom" align="start" className="w-96">
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

/** Finds the rendered message element closest to `messageIndex` (tool-result
 * messages can be absorbed into their caller, so exact anchors may not render). */
function findMomentAnchor(container: HTMLElement, messageIndex: number): HTMLElement | null {
  const exact = container.querySelector<HTMLElement>(`[data-message-index="${messageIndex}"]`)
  if (exact) return exact
  let best: { node: HTMLElement; distance: number } | null = null
  for (const node of container.querySelectorAll<HTMLElement>("[data-message-index]")) {
    const raw = node.getAttribute("data-message-index")
    if (raw == null) continue
    const index = Number.parseInt(raw, 10)
    if (Number.isNaN(index)) continue
    const distance = Math.abs(index - messageIndex)
    if (!best || distance < best.distance) best = { node, distance }
  }
  return best?.node ?? null
}

function findMomentRangeAnchors(
  container: HTMLElement,
  firstMessageIndex: number,
  lastMessageIndex: number,
): readonly HTMLElement[] {
  const anchors: HTMLElement[] = []
  for (const node of container.querySelectorAll<HTMLElement>("[data-message-index]")) {
    const raw = node.getAttribute("data-message-index")
    if (raw == null) continue
    const index = Number.parseInt(raw, 10)
    if (Number.isNaN(index)) continue
    if (index >= firstMessageIndex && index <= lastMessageIndex) anchors.push(node)
  }

  if (anchors.length > 0) return anchors
  const fallback = findMomentAnchor(container, firstMessageIndex)
  return fallback ? [fallback] : []
}

function flashMomentAnchors(container: HTMLElement, anchors: readonly HTMLElement[]) {
  if (anchors.length === 0) return

  if (anchors.length === 1) {
    const anchor = anchors[0]
    if (!anchor) return
    anchor.style.boxShadow = "0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--primary) / 0.5)"
    window.setTimeout(() => {
      anchor.style.boxShadow = ""
    }, 4000)
    return
  }

  const containerRect = container.getBoundingClientRect()
  const rects = anchors.map((anchor) => anchor.getBoundingClientRect())
  const top = Math.min(...rects.map((rect) => rect.top)) - containerRect.top + container.scrollTop
  const left = Math.min(...rects.map((rect) => rect.left)) - containerRect.left + container.scrollLeft
  const right = Math.max(...rects.map((rect) => rect.right)) - containerRect.left + container.scrollLeft
  const bottom = Math.max(...rects.map((rect) => rect.bottom)) - containerRect.top + container.scrollTop
  const previousPosition = container.style.position
  if (getComputedStyle(container).position === "static") container.style.position = "relative"

  const highlight = document.createElement("div")
  highlight.setAttribute("aria-hidden", "true")
  highlight.style.position = "absolute"
  highlight.style.pointerEvents = "none"
  highlight.style.zIndex = "1"
  highlight.style.top = `${top - 4}px`
  highlight.style.left = `${left - 4}px`
  highlight.style.width = `${right - left + 8}px`
  highlight.style.height = `${bottom - top + 8}px`
  highlight.style.borderRadius = "12px"
  highlight.style.boxShadow = "0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--primary) / 0.5)"
  highlight.style.transition = "opacity 300ms ease"
  container.appendChild(highlight)

  window.setTimeout(() => {
    highlight.style.opacity = "0"
  }, 3700)
  window.setTimeout(() => {
    highlight.remove()
    container.style.position = previousPosition
  }, 4000)
}

/** Scrolls once per (sessionId, focusMomentKind) to the first moment carrying
 * a label of that kind, flashing the anchored message and opening the label's
 * evidence popover. Retries via MutationObserver until the conversation DOM
 * has mounted. */
function useScrollToFocusedMoment({
  scrollRef,
  sessionId,
  focusMomentKind,
  focusMomentId,
  moments,
  isActive,
  isConversationReady,
  onFocused,
}: {
  readonly scrollRef: RefObject<HTMLDivElement | null>
  readonly sessionId: string
  readonly focusMomentKind: string | undefined
  readonly focusMomentId: string | undefined
  readonly moments: readonly SessionMomentIntelligenceRecord[] | undefined
  readonly isActive: boolean
  /** The conversation has rendered, so the scroll container ref is attached. */
  readonly isConversationReady: boolean
  readonly onFocused: (labelId: string) => void
}): void {
  const lastScrolledKey = useRef<string | null>(null)
  useEffect(() => {
    if ((!focusMomentKind && !focusMomentId) || !isActive || !isConversationReady || !moments) return
    const container = scrollRef.current
    if (!container) return
    const key = `${sessionId}::${focusMomentKind ?? ""}::${focusMomentId ?? ""}`
    if (lastScrolledKey.current === key) return
    // A focused label kind wins (it carries the badge to open); otherwise fall
    // back to the semantic moment that linked the session to the topic.
    const labelTarget = focusMomentKind
      ? moments.find((row) => row.labels.some((label) => label.kind === focusMomentKind))
      : undefined
    const targetLabel = labelTarget?.labels.find((label) => label.kind === focusMomentKind)
    const momentTarget =
      !targetLabel && focusMomentId ? moments.find((row) => row.moment.momentId === focusMomentId) : undefined
    const anchorIndex = targetLabel?.lastMessageIndex ?? momentTarget?.moment.firstMessageIndex
    if (anchorIndex === undefined) return

    let done = false

    function findAndScroll(): boolean {
      if (done || !container || anchorIndex === undefined) return true
      const anchors = momentTarget
        ? findMomentRangeAnchors(container, momentTarget.moment.firstMessageIndex, momentTarget.moment.lastMessageIndex)
        : [findMomentAnchor(container, anchorIndex)].filter((anchor): anchor is HTMLElement => anchor !== null)
      const anchor = anchors[0]
      if (!anchor) return false
      lastScrolledKey.current = key
      anchor.scrollIntoView({ block: "center", behavior: "smooth" })
      flashMomentAnchors(container, anchors)
      if (targetLabel) onFocused(targetLabel.labelId)
      return true
    }

    if (findAndScroll()) return

    const observer = new MutationObserver(() => {
      if (done) return
      if (findAndScroll()) {
        done = true
        observer.disconnect()
        window.clearTimeout(timeout)
      }
    })
    observer.observe(container, { childList: true, subtree: true })
    const timeout = window.setTimeout(() => {
      done = true
      observer.disconnect()
    }, MOMENT_FOCUS_OBSERVER_TIMEOUT_MS)
    return () => {
      done = true
      observer.disconnect()
      window.clearTimeout(timeout)
    }
  }, [focusMomentId, focusMomentKind, isActive, isConversationReady, moments, onFocused, scrollRef, sessionId])
}

/**
 * The session Conversation tab renders the latest ingested trace's
 * conversation (with that trace's inline annotations) by mounting the existing
 * trace ConversationTab against `latestTraceId`. Reusing the full trace keeps
 * inline annotation anchoring (`messageIndex`) exact. When the Annotations tab
 * focuses an annotation on the latest trace (which writes the `annotationId`
 * param and switches here) the conversation scrolls to + opens that annotation.
 *
 * Detected moment labels from the session analysis render as badges anchored
 * below the exact message that triggered the detection. When opened with a
 * `focusMomentKind` (e.g. from a behaviour's detected-signal filter) the
 * conversation scrolls to the first moment carrying that label.
 */
export function ConversationTab({
  projectId,
  sessionId,
  latestTraceId,
  isActive,
  searchQuery,
  focusMomentKind,
  focusMomentId,
}: {
  readonly projectId: string
  readonly sessionId: string
  readonly latestTraceId: string
  readonly isActive: boolean
  readonly searchQuery?: string
  readonly focusMomentKind?: MomentKind | undefined
  /** Scrolls to this semantic moment when no label kind is focused. */
  readonly focusMomentId?: string | undefined
}) {
  const [focusAnnotationId, setFocusAnnotationId] = useParamState("annotationId", "")
  const selectedLabelStore = useSelectedLabelStore()
  const { scrollContainerRef, textSelectionPopoverControlsRef, traceDetail, isDetailLoading } =
    useConversationAnnotationFocus({
      projectId,
      traceId: latestTraceId,
      focusAnnotationId,
      isConversationActive: isActive,
      onFocusConsumed: () => setFocusAnnotationId(""),
    })
  const { data: moments } = useSessionMomentIntelligence({ projectId, sessionId })

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

  useScrollToFocusedMoment({
    scrollRef: scrollContainerRef,
    sessionId,
    focusMomentKind,
    focusMomentId,
    moments,
    isActive,
    isConversationReady: !isDetailLoading && traceDetail != null,
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

  return (
    <TraceConversationTab
      traceDetail={traceDetail}
      isDetailLoading={isDetailLoading}
      projectId={projectId}
      isActive={isActive}
      scrollContainerRef={scrollContainerRef}
      textSelectionPopoverControlsRef={textSelectionPopoverControlsRef}
      {...(labelsByMessageIndex.size > 0 ? { messageTrailingSlot } : {})}
      {...(searchQuery ? { searchQuery } : {})}
    />
  )
}
