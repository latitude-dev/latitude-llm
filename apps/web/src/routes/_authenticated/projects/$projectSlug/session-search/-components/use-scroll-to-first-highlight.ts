import type { TraceSearchHighlightsResult } from "@domain/spans"
import { type RefObject, useEffect, useRef } from "react"

const FUZZY_OFFSET_WINDOW = 10
const SCROLL_OBSERVER_TIMEOUT_MS = 2000

// Exact data-source-start match first, then a ±FUZZY_OFFSET_WINDOW scan in
// the same message to forgive offset shifts from markdown transforms (emoji,
// GFM tables, autolinks).
function findHighlightNode(container: HTMLElement, messageIndex: number, startOffset: number): Element | null {
  const exact = container.querySelector(`[data-message-index="${messageIndex}"] [data-source-start="${startOffset}"]`)
  if (exact) return exact

  const messageRoot = container.querySelector(`[data-message-index="${messageIndex}"]`)
  if (!messageRoot) return null

  const candidates = messageRoot.querySelectorAll<HTMLElement>("[data-source-start]")
  let best: { node: Element; distance: number } | null = null
  for (const candidate of candidates) {
    const raw = candidate.getAttribute("data-source-start")
    if (raw == null) continue
    const candidateStart = Number.parseInt(raw, 10)
    if (Number.isNaN(candidateStart)) continue
    const distance = Math.abs(candidateStart - startOffset)
    if (distance > FUZZY_OFFSET_WINDOW) continue
    if (!best || distance < best.distance) {
      best = { node: candidate, distance }
    }
  }
  return best?.node ?? null
}

/**
 * Scrolls to the first resolvable search hit once per (traceId, searchQuery).
 * MutationObserver retries on DOM mutations so we survive MarkdownContent's
 * own collapsed-middle auto-expand without rAF chains.
 */
export function useScrollToFirstHighlight({
  scrollRef,
  traceId,
  searchQuery,
  highlightsData,
}: {
  readonly scrollRef: RefObject<HTMLDivElement | null>
  readonly traceId: string
  readonly searchQuery: string
  readonly highlightsData: TraceSearchHighlightsResult | undefined
}): void {
  const lastScrolledKey = useRef<string | null>(null)
  useEffect(() => {
    if (!highlightsData || highlightsData.firstMatchIndex < 0) return
    if (!scrollRef.current) return
    const key = `${traceId}::${searchQuery}`
    if (lastScrolledKey.current === key) return
    const container = scrollRef.current
    const hits = highlightsData.highlights.slice(highlightsData.firstMatchIndex)
    if (hits.length === 0) return

    let done = false

    function findAndScroll(): boolean {
      if (done) return true
      for (const h of hits) {
        const target = findHighlightNode(container, h.messageIndex, h.startOffset)
        if (target) {
          target.scrollIntoView({ block: "center", behavior: "smooth" })
          lastScrolledKey.current = key
          return true
        }
      }
      return false
    }

    if (findAndScroll()) {
      done = true
      return
    }

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
    }, SCROLL_OBSERVER_TIMEOUT_MS)
    return () => {
      done = true
      observer.disconnect()
      window.clearTimeout(timeout)
    }
  }, [highlightsData, scrollRef, traceId, searchQuery])
}
