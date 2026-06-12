import { type RefObject, useEffect, useState } from "react"
import type { ConversationTimeline } from "../../../../../../lib/conversation-timeline/build-conversation-timeline.ts"
import { type TrackBand, visibleRangeToBand } from "../../../../../../lib/conversation-timeline/message-windows.ts"

/**
 * Time band covered by the messages currently visible in the scroll container,
 * for the track's viewport indicator. Null when nothing is measurable (no
 * timeline yet, hidden tab, empty viewport).
 */
export function useViewportBand({
  scrollRef,
  timeline,
  isActive,
}: {
  readonly scrollRef: RefObject<HTMLDivElement | null>
  readonly timeline: ConversationTimeline | null
  readonly isActive: boolean
}): TrackBand | null {
  const [band, setBand] = useState<TrackBand | null>(null)

  // TODO(frontend-use-effect-policy): the band tracks scroll position and
  // layout, external systems only observable via listeners/observers.
  useEffect(() => {
    const container = scrollRef.current
    if (!container || !timeline || !isActive) {
      setBand(null)
      return
    }

    const measure = () => {
      const containerRect = container.getBoundingClientRect()
      if (containerRect.height === 0) {
        setBand(null)
        return
      }
      let first = -1
      let last = -1
      for (const node of container.querySelectorAll<HTMLElement>("[data-message-index]")) {
        const raw = node.getAttribute("data-message-index")
        if (raw == null) continue
        const index = Number.parseInt(raw, 10)
        if (Number.isNaN(index)) continue
        const rect = node.getBoundingClientRect()
        if (rect.bottom <= containerRect.top || rect.top >= containerRect.bottom) continue
        if (first === -1 || index < first) first = index
        if (index > last) last = index
      }
      if (first === -1) {
        setBand(null)
        return
      }
      const exact = visibleRangeToBand(timeline, first, last)
      const next = exact
        ? { startPct: Math.round(exact.startPct * 10) / 10, endPct: Math.round(exact.endPct * 10) / 10 }
        : null
      setBand((prev) => (prev && next && prev.startPct === next.startPct && prev.endPct === next.endPct ? prev : next))
    }

    let raf = 0
    const scheduleMeasure = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        measure()
      })
    }

    measure()
    container.addEventListener("scroll", scheduleMeasure, { passive: true })
    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(container)
    if (container.firstElementChild) observer.observe(container.firstElementChild)
    return () => {
      container.removeEventListener("scroll", scheduleMeasure)
      observer.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [scrollRef, timeline, isActive])

  return band
}
