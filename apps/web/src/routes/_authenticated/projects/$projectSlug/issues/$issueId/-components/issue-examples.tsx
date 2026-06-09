import {
  Button,
  Conversation,
  DetailSection,
  type FirstMatchHint,
  type HighlightRange,
  Icon,
  Sheet,
  Skeleton,
  Text,
  Tooltip,
  useMountEffect,
} from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { ChevronLeftIcon, ChevronRightIcon, ListTreeIcon, Maximize2Icon, MessageSquareTextIcon } from "lucide-react"
import { type RefObject, useMemo, useRef, useState } from "react"
import { useIssueOccurrences } from "../../../../../../../domains/issues/issues.collection.ts"
import type { IssueOccurrenceRecord } from "../../../../../../../domains/issues/issues.functions.ts"
import { useTraceDetail } from "../../../../../../../domains/traces/traces.collection.ts"
import { useParamState } from "../../../../../../../lib/hooks/useParamState.ts"
import { TraceDetailDrawer } from "../../../-components/trace-detail-drawer.tsx"

const SCROLL_OBSERVER_TIMEOUT_MS = 2000
const FUZZY_OFFSET_WINDOW = 10

// Corner label for the framed message region — mirrors the semantic-search
// "Related to your search" treatment, but for issue occurrences.
const REGION_LABEL = {
  label: "Where this issue occurs",
  tooltip: "An annotation flagged this message as an occurrence of this issue.",
} as const

function centerVertically(container: HTMLElement, target: Element) {
  const containerRect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const targetTopWithinContent = targetRect.top - containerRect.top + container.scrollTop
  const top = targetTopWithinContent - container.clientHeight / 2 + targetRect.height / 2
  container.scrollTo({ top: Math.max(0, top), behavior: "smooth" })
}

function findAnchorNode(container: HTMLElement, anchor: IssueOccurrenceRecord["anchor"]): Element | null {
  const messageSelector = `[data-message-index="${anchor.messageIndex}"]`
  // Substring anchor: scroll to the exact highlighted text run; fall back to a
  // ±window scan (markdown transforms can shift offsets), then the message.
  if (anchor.startOffset !== null) {
    const exact = container.querySelector(`${messageSelector} [data-source-start="${anchor.startOffset}"]`)
    if (exact) return exact
    const messageRoot = container.querySelector(messageSelector)
    if (messageRoot) {
      let best: { node: Element; distance: number } | null = null
      for (const candidate of messageRoot.querySelectorAll<HTMLElement>("[data-source-start]")) {
        const raw = candidate.getAttribute("data-source-start")
        if (raw === null) continue
        const start = Number.parseInt(raw, 10)
        if (Number.isNaN(start)) continue
        const distance = Math.abs(start - anchor.startOffset)
        if (distance <= FUZZY_OFFSET_WINDOW && (!best || distance < best.distance)) best = { node: candidate, distance }
      }
      if (best) return best.node
    }
  }
  return container.querySelector(messageSelector)
}

/**
 * Scrolls the conversation to the occurrence's anchor on mount. The viewer is
 * keyed by score id so switching examples remounts it and re-runs this. Waits
 * for the (async-rendered markdown) node via a MutationObserver, then centers it.
 */
function useScrollToAnchor(scrollRef: RefObject<HTMLDivElement | null>, anchor: IssueOccurrenceRecord["anchor"]) {
  useMountEffect(() => {
    const container = scrollRef.current
    if (!container) return
    let done = false
    const attempt = () => {
      if (done) return true
      const target = findAnchorNode(container, anchor)
      if (!target) return false
      centerVertically(container, target)
      done = true
      return true
    }
    if (attempt()) return
    const observer = new MutationObserver(() => {
      if (attempt()) {
        observer.disconnect()
        window.clearTimeout(timeout)
      }
    })
    observer.observe(container, { childList: true, subtree: true })
    const timeout = window.setTimeout(() => {
      done = true
      observer.disconnect()
    }, SCROLL_OBSERVER_TIMEOUT_MS)
    return () => {
      done = true
      observer.disconnect()
      window.clearTimeout(timeout)
    }
  })
}

function ExampleConversation({
  projectId,
  occurrence,
}: {
  readonly projectId: string
  readonly occurrence: IssueOccurrenceRecord
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { data: traceDetail, isLoading } = useTraceDetail({ projectId, traceId: occurrence.traceId })

  const { anchor } = occurrence

  // Frame the flagged message (region highlight, like semantic search) and,
  // when the annotation pinpointed a substring, also paint that exact text.
  const highlightRanges = useMemo<readonly HighlightRange[]>(() => {
    const ranges: HighlightRange[] = [
      { messageIndex: anchor.messageIndex, partIndex: 0, startOffset: 0, endOffset: 0, type: "search-semantic-region" },
    ]
    if (anchor.partIndex !== null && anchor.startOffset !== null && anchor.endOffset !== null) {
      ranges.push({
        messageIndex: anchor.messageIndex,
        partIndex: anchor.partIndex,
        startOffset: anchor.startOffset,
        endOffset: anchor.endOffset,
        type: "annotation",
      })
    }
    return ranges
  }, [anchor])

  const firstMatchHint = useMemo<FirstMatchHint | null>(
    () => (anchor.partIndex !== null ? { messageIndex: anchor.messageIndex, partIndex: anchor.partIndex } : null),
    [anchor],
  )

  useScrollToAnchor(scrollRef, anchor)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (!traceDetail) {
    return (
      <div className="flex items-center justify-center p-6">
        <Text.H6 color="foregroundMuted">This example's conversation could not be loaded.</Text.H6>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className="flex max-h-[32rem] min-w-0 flex-col overflow-y-auto overflow-x-hidden rounded-lg border bg-background px-4 py-6"
    >
      <Conversation
        messages={traceDetail.allMessages}
        scrollContainerRef={scrollRef}
        highlightRanges={highlightRanges}
        firstMatchHint={firstMatchHint}
        regionLabel={REGION_LABEL}
      />
    </div>
  )
}

/**
 * Examples carousel: cycles through an issue's pinpointed occurrences and, for
 * each, renders its conversation scrolled to and framing the exact flagged
 * message/substring (same highlight treatment as search), with the annotator
 * feedback above. "Expand" / "See trace" open the full trace drawer (on the
 * Conversation / Trace tab respectively), like clicking a row in Traces. The
 * current example is reflected in `?example=<scoreId>` for sharable links.
 */
export function IssueExamples({ projectId, issueId }: { readonly projectId: string; readonly issueId: string }) {
  const { data, isLoading } = useIssueOccurrences({ projectId, issueId })
  const occurrences = useMemo(() => data?.items ?? [], [data])
  const [exampleId, setExampleId] = useParamState("example", "")
  const [traceSheet, setTraceSheet] = useState<{
    readonly traceId: string
    readonly tab: "conversation" | "trace"
  } | null>(null)

  const currentIndex = useMemo(() => {
    const found = occurrences.findIndex((occurrence) => occurrence.scoreId === exampleId)
    return found >= 0 ? found : 0
  }, [occurrences, exampleId])

  const current = occurrences[currentIndex]
  const canPrev = currentIndex > 0
  const canNext = currentIndex < occurrences.length - 1
  const goTo = (index: number) => {
    const next = occurrences[index]
    if (next) setExampleId(next.scoreId)
  }

  useHotkeys([
    {
      hotkey: "J",
      callback: () => canNext && goTo(currentIndex + 1),
      options: { enabled: canNext, ignoreInputs: true },
    },
    {
      hotkey: "K",
      callback: () => canPrev && goTo(currentIndex - 1),
      options: { enabled: canPrev, ignoreInputs: true },
    },
  ])

  return (
    <DetailSection
      icon={<Icon icon={MessageSquareTextIcon} size="sm" />}
      label="Examples"
      defaultOpen
      contentClassName="pl-0 max-h-none overflow-visible"
    >
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !current ? (
        <Text.H6 color="foregroundMuted">
          No pinpointed examples yet. Examples appear when an occurrence is annotated on a specific message.
        </Text.H6>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-row items-center justify-between gap-2">
            <Text.H6 color="foregroundMuted">
              Example {currentIndex + 1} of {occurrences.length}
            </Text.H6>
            <div className="flex flex-row items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTraceSheet({ traceId: current.traceId, tab: "trace" })}
              >
                <Icon icon={ListTreeIcon} size="sm" />
                See trace
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTraceSheet({ traceId: current.traceId, tab: "conversation" })}
              >
                <Icon icon={Maximize2Icon} size="sm" />
                Expand
              </Button>
              <div className="mx-1 h-5 w-px bg-border" />
              <Tooltip
                asChild
                side="bottom"
                trigger={
                  <Button
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    disabled={!canPrev}
                    onClick={() => goTo(currentIndex - 1)}
                    aria-label="Previous example"
                  >
                    <ChevronLeftIcon className="h-4 w-4 text-muted-foreground" />
                  </Button>
                }
              >
                Previous example (K)
              </Tooltip>
              <Tooltip
                asChild
                side="bottom"
                trigger={
                  <Button
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    disabled={!canNext}
                    onClick={() => goTo(currentIndex + 1)}
                    aria-label="Next example"
                  >
                    <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                  </Button>
                }
              >
                Next example (J)
              </Tooltip>
            </div>
          </div>

          <div className="flex flex-col gap-1 rounded-lg bg-secondary p-3">
            <Text.H6 color="foregroundMuted">Feedback</Text.H6>
            <Text.H5 color="foreground">{current.feedback}</Text.H5>
          </div>

          {/* Keyed by score id: switching examples remounts the viewer so the
              scroll-to-anchor effect re-runs for the new occurrence. */}
          <ExampleConversation key={current.scoreId} projectId={projectId} occurrence={current} />
        </div>
      )}

      <Sheet open={traceSheet !== null} onClose={() => setTraceSheet(null)} closeAriaLabel="Close trace panel">
        {traceSheet ? (
          <TraceDetailDrawer
            key={`${traceSheet.traceId}-${traceSheet.tab}`}
            projectId={projectId}
            traceId={traceSheet.traceId}
            onClose={() => setTraceSheet(null)}
            canNavigateNext={false}
            canNavigatePrev={false}
            urlSyncedTabs={false}
            initialTab={traceSheet.tab}
            drawerStoreKey="issue-trace-detail-drawer-width"
            closeLabel="Back to issue"
          />
        ) : null}
      </Sheet>
    </DetailSection>
  )
}
