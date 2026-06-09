import {
  Badge,
  Button,
  Conversation,
  DetailSection,
  type FirstMatchHint,
  type HighlightRange,
  Icon,
  Skeleton,
  Text,
  Tooltip,
  useMountEffect,
} from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { ChevronLeftIcon, ChevronRightIcon, MessageSquareTextIcon } from "lucide-react"
import { type RefObject, useMemo, useRef } from "react"
import { useIssueOccurrences } from "../../../../../../../domains/issues/issues.collection.ts"
import type { IssueOccurrenceRecord } from "../../../../../../../domains/issues/issues.functions.ts"
import { useTraceDetail } from "../../../../../../../domains/traces/traces.collection.ts"
import { useParamState } from "../../../../../../../lib/hooks/useParamState.ts"

const SCROLL_OBSERVER_TIMEOUT_MS = 2000
const FUZZY_OFFSET_WINDOW = 10

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
  const hasSubstring = anchor.partIndex !== null && anchor.startOffset !== null && anchor.endOffset !== null

  const highlightRanges = useMemo<readonly HighlightRange[]>(() => {
    if (!hasSubstring || anchor.partIndex === null || anchor.startOffset === null || anchor.endOffset === null)
      return []
    return [
      {
        messageIndex: anchor.messageIndex,
        partIndex: anchor.partIndex,
        startOffset: anchor.startOffset,
        endOffset: anchor.endOffset,
        type: "annotation",
      },
    ]
  }, [anchor, hasSubstring])

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
        messageTrailingSlot={(messageIndex) =>
          messageIndex === anchor.messageIndex ? (
            <Badge variant="yellow" size="small" shape="rounded">
              Flagged here
            </Badge>
          ) : null
        }
      />
    </div>
  )
}

/**
 * Examples carousel: cycles through an issue's pinpointed occurrences and, for
 * each, renders its conversation scrolled to and highlighting the exact flagged
 * message/substring, with the annotator feedback shown above. The current
 * example is reflected in the `?example=<scoreId>` param for sharable links.
 */
export function IssueExamples({ projectId, issueId }: { readonly projectId: string; readonly issueId: string }) {
  const { data, isLoading } = useIssueOccurrences({ projectId, issueId })
  const occurrences = useMemo(() => data?.items ?? [], [data])
  const [exampleId, setExampleId] = useParamState("example", "")

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
            <div className="flex flex-row items-center gap-1">
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
    </DetailSection>
  )
}
