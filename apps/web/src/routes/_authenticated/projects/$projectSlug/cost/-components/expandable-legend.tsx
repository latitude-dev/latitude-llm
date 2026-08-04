import { Button } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { type ReactNode, useLayoutEffect, useRef, useState } from "react"

/** Gap between flex items in pixels (matches `gap-1` / 0.25rem at 16px base). */
const GAP_PX = 4

export interface ExpandableLegendEntry {
  readonly key: string
}

/**
 * One row of legend entries, collapsed to fit its container's width. Entries are
 * never truncated — a legend entry that doesn't fully fit is hidden rather than
 * clipped, and the last visible slot becomes a "Show more" control. Expanding
 * wraps every entry across as many rows as it takes and appends "Show less".
 */
export function ExpandableLegend<TEntry extends ExpandableLegendEntry>({
  entries,
  renderEntry,
}: {
  readonly entries: readonly TEntry[]
  readonly renderEntry: (entry: TEntry) => ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [visibleCount, setVisibleCount] = useState(entries.length)

  useLayoutEffect(() => {
    if (expanded) return
    const container = containerRef.current
    if (!container) return

    const measure = () => {
      const itemEls = Array.from(container.querySelectorAll<HTMLElement>("[data-legend-item]"))
      const moreEl = container.querySelector<HTMLElement>("[data-legend-more]")

      // Temporarily reveal everything at natural width so we can measure it.
      itemEls.forEach((el) => {
        el.style.display = ""
      })
      if (moreEl) moreEl.style.display = "inline-flex"

      const containerWidth = container.offsetWidth
      const itemWidths = itemEls.map((el) => el.offsetWidth)
      // Include the gap that would precede the "Show more" control.
      const moreWidth = moreEl ? moreEl.offsetWidth + GAP_PX : 0
      const totalWidth = itemWidths.reduce((sum, width, i) => sum + (i > 0 ? GAP_PX : 0) + width, 0)

      let fitCount = entries.length
      if (totalWidth > containerWidth) {
        let usedWidth = 0
        fitCount = 0
        for (let i = 0; i < itemWidths.length; i++) {
          const gap = i > 0 ? GAP_PX : 0
          // The last entry never needs to leave room for the control — nothing is left to hide behind it.
          const reserve = i < itemWidths.length - 1 ? moreWidth : 0
          if (usedWidth + gap + itemWidths[i] + reserve > containerWidth) break
          usedWidth += gap + itemWidths[i]
          fitCount = i + 1
        }
      }

      // Apply visibility directly so React doesn't need another paint cycle.
      itemEls.forEach((el, i) => {
        el.style.display = i < fitCount ? "" : "none"
      })
      if (moreEl) moreEl.style.display = fitCount < entries.length ? "inline-flex" : "none"

      setVisibleCount(fitCount)
    }

    const observer = new ResizeObserver(measure)
    observer.observe(container)
    measure()

    return () => observer.disconnect()
  }, [entries, expanded])

  const hasOverflow = !expanded && visibleCount < entries.length

  return (
    <div
      ref={containerRef}
      className={
        expanded ? "flex flex-row flex-wrap items-center gap-1" : "flex min-w-0 items-center gap-1 overflow-hidden"
      }
    >
      {entries.map((entry, i) => (
        <span
          key={entry.key}
          data-legend-item=""
          className="shrink-0 whitespace-nowrap"
          style={{ display: !expanded && i >= visibleCount ? "none" : undefined }}
        >
          {renderEntry(entry)}
        </span>
      ))}
      {expanded ? null : (
        <span
          data-legend-more=""
          className="shrink-0 whitespace-nowrap"
          style={{ display: hasOverflow ? "inline-flex" : "none" }}
        >
          <Button variant="link" size="sm" className="whitespace-nowrap" onClick={() => setExpanded(true)}>
            {`Show all ${formatCount(entries.length)}`}
          </Button>
        </span>
      )}
      {expanded ? (
        <Button variant="link" size="sm" className="shrink-0 whitespace-nowrap" onClick={() => setExpanded(false)}>
          Show less
        </Button>
      ) : null}
    </div>
  )
}
