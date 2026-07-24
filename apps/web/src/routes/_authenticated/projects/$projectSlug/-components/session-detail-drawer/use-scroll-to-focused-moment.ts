import { type RefObject, useEffect, useRef } from "react"
import type { SessionMomentIntelligenceRecord } from "../../../../../../domains/traces/traces.functions.ts"
import { findNearestMessageAnchor } from "../conversation-timeline/flash-highlight.ts"

const MOMENT_FOCUS_OBSERVER_TIMEOUT_MS = 2000

export function resolveFocusedMomentTarget({
  focusMomentKind,
  focusMomentId,
  moments,
  loadedMessageCount,
}: {
  readonly focusMomentKind: string | undefined
  readonly focusMomentId: string | undefined
  readonly moments: readonly SessionMomentIntelligenceRecord[]
  readonly loadedMessageCount: number
}) {
  const labelTarget = focusMomentKind
    ? moments.find((row) => row.labels.some((label) => label.kind === focusMomentKind))
    : undefined
  const targetLabel = labelTarget?.labels.find((label) => label.kind === focusMomentKind)
  const momentTarget =
    !targetLabel && focusMomentId ? moments.find((row) => row.moment.momentId === focusMomentId) : undefined
  const anchorIndex = targetLabel?.lastMessageIndex ?? momentTarget?.moment.firstMessageIndex

  if (anchorIndex === undefined || anchorIndex >= loadedMessageCount) return null
  return { anchorIndex, momentTarget, targetLabel }
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
  const fallback = findNearestMessageAnchor(container, firstMessageIndex)
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

export function useScrollToFocusedMoment({
  scrollRef,
  sessionId,
  focusMomentKind,
  focusMomentId,
  moments,
  isActive,
  isConversationReady,
  loadedMessageCount,
  onFocused,
}: {
  readonly scrollRef: RefObject<HTMLDivElement | null>
  readonly sessionId: string
  readonly focusMomentKind: string | undefined
  readonly focusMomentId: string | undefined
  readonly moments: readonly SessionMomentIntelligenceRecord[] | undefined
  readonly isActive: boolean
  readonly isConversationReady: boolean
  readonly loadedMessageCount: number
  readonly onFocused: (labelId: string) => void
}): void {
  const lastScrolledKey = useRef<string | null>(null)
  useEffect(() => {
    if ((!focusMomentKind && !focusMomentId) || !isActive || !isConversationReady || !moments) return
    const container = scrollRef.current
    if (!container) return
    const key = `${sessionId}::${focusMomentKind ?? ""}::${focusMomentId ?? ""}`
    if (lastScrolledKey.current === key) return

    const target = resolveFocusedMomentTarget({ focusMomentKind, focusMomentId, moments, loadedMessageCount })
    if (!target) return
    const { anchorIndex, momentTarget, targetLabel } = target
    let done = false

    function findAndScroll(): boolean {
      if (done || !container) return true
      const anchors = momentTarget
        ? findMomentRangeAnchors(container, momentTarget.moment.firstMessageIndex, momentTarget.moment.lastMessageIndex)
        : [findNearestMessageAnchor(container, anchorIndex)].filter((anchor): anchor is HTMLElement => anchor !== null)
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
  }, [
    focusMomentId,
    focusMomentKind,
    isActive,
    isConversationReady,
    loadedMessageCount,
    moments,
    onFocused,
    scrollRef,
    sessionId,
  ])
}
