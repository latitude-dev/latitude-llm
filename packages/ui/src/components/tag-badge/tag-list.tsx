import { memo, useLayoutEffect, useMemo, useRef, useState } from "react"

import { Tooltip } from "../tooltip/tooltip.tsx"
import { TagBadge } from "./tag-badge.tsx"

/** Gap between flex items in pixels (matches gap-1 / 0.25rem at 16px base). */
const GAP_PX = 4

export interface TagListProps {
  readonly tags: readonly string[]
}

/**
 * Renders a horizontal list of tag badges left-to-right.
 *
 * When the list overflows the container it truncates to the largest prefix that
 * fits alongside a "+N" overflow badge, so nothing is ever clipped or scrolled.
 * Hovering the overflow badge shows the full tag list in a tooltip.
 */
export const TagList = memo(function TagList({ tags }: TagListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(tags.length)
  const sorted = useMemo(() => [...tags].sort(), [tags])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const measure = () => {
      const tagEls = Array.from(container.querySelectorAll<HTMLElement>("[data-tag-item]"))
      const overflowEl = container.querySelector<HTMLElement>("[data-overflow]")

      // Temporarily reveal everything so we can measure natural widths.
      tagEls.forEach((el) => {
        el.style.display = ""
      })
      if (overflowEl) overflowEl.style.display = "inline-flex"

      const containerWidth = container.offsetWidth
      // Include the gap that would precede the overflow badge.
      const overflowWidth = overflowEl ? overflowEl.offsetWidth + GAP_PX : 0

      const totalWidth = tagEls.reduce((acc, el, i) => acc + (i > 0 ? GAP_PX : 0) + el.offsetWidth, 0)

      let newCount = tags.length

      if (totalWidth > containerWidth) {
        // Find the largest prefix that leaves room for the overflow badge.
        let usedWidth = 0
        newCount = 0

        for (let i = 0; i < tagEls.length; i++) {
          const gap = i > 0 ? GAP_PX : 0
          const tagWidth = tagEls[i].offsetWidth

          if (usedWidth + gap + tagWidth + overflowWidth <= containerWidth) {
            usedWidth += gap + tagWidth
            newCount = i + 1
          } else {
            break
          }
        }

        // Always show at least one tag — showing only "+N" with no visible
        // tags is confusing, especially when there is a single tag.
        if (newCount === 0) newCount = 1
      }

      // Apply visibility directly so React doesn't need another paint cycle.
      tagEls.forEach((el, i) => {
        el.style.display = i >= newCount ? "none" : ""
      })
      if (overflowEl) {
        overflowEl.style.display = newCount < tags.length ? "inline-flex" : "none"
      }

      setVisibleCount(newCount)
    }

    const observer = new ResizeObserver(measure)
    observer.observe(container)
    measure()

    return () => observer.disconnect()
  }, [sorted])

  if (tags.length === 0) return null
  const hasOverflow = visibleCount < sorted.length
  const hiddenTags = sorted.slice(visibleCount)

  return (
    <div ref={containerRef} className="flex items-center gap-1 overflow-hidden min-w-0">
      {sorted.map((tag, i) => (
        <span key={tag} data-tag-item="" style={{ display: i >= visibleCount ? "none" : undefined }}>
          <TagBadge tag={tag} />
        </span>
      ))}
      <Tooltip
        asChild
        trigger={
          <span
            data-overflow=""
            style={{ display: hasOverflow ? "inline-flex" : "none" }}
            className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground cursor-default select-none whitespace-nowrap"
          >
            +{hiddenTags.length}
          </span>
        }
      >
        <div className="flex flex-col gap-1">
          {hiddenTags.map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
        </div>
      </Tooltip>
    </div>
  )
})
