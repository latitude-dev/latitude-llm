import { memo, useLayoutEffect, useMemo, useRef, useState } from "react"

import { Tooltip } from "../tooltip/tooltip.tsx"
import { TagBadge, TagBadgeList } from "./tag-badge.tsx"

/** Gap between flex items in pixels (matches gap-1 / 0.25rem at 16px base). */
const GAP_PX = 4

/** Below this width a truncated badge would be an unreadable sliver — collapse to "+N" instead. */
const MIN_TRUNCATED_PX = 28

export interface TagListProps {
  readonly tags: readonly string[]
  readonly wrap?: boolean
}

interface Layout {
  readonly visibleCount: number
  readonly truncatedWidth: number | null
}

/** Tag badges left-to-right; overflow truncates the last visible badge or collapses into "+N" instead of ever clipping — nothing scrolls. `wrap` renders every tag and wraps lines instead. */
export const TagList = memo(function TagList({ tags, wrap = false }: TagListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<Layout>({ visibleCount: tags.length, truncatedWidth: null })
  const sorted = useMemo(() => [...tags].sort(), [tags])

  useLayoutEffect(() => {
    if (wrap) return
    const container = containerRef.current
    if (!container) return

    const measure = () => {
      const tagEls = Array.from(container.querySelectorAll<HTMLElement>("[data-tag-item]"))
      const overflowEl = container.querySelector<HTMLElement>("[data-overflow]")

      // Temporarily reveal everything at natural width so we can measure it.
      tagEls.forEach((el) => {
        el.style.display = ""
        const badgeEl = el.firstElementChild as HTMLElement | null
        if (badgeEl) badgeEl.style.maxWidth = ""
      })
      if (overflowEl) overflowEl.style.display = "inline-flex"

      const containerWidth = container.offsetWidth
      const tagWidths = tagEls.map((el) => el.offsetWidth)
      // Include the gap that would precede the overflow badge.
      const overflowWidth = overflowEl ? overflowEl.offsetWidth + GAP_PX : 0

      const totalWidth = tagWidths.reduce((acc, w, i) => acc + (i > 0 ? GAP_PX : 0) + w, 0)

      let fullCount = tags.length
      let truncatedWidth: number | null = null

      if (totalWidth > containerWidth) {
        // Find the largest prefix of full-width badges that leaves room for the overflow badge.
        let usedWidth = 0
        fullCount = 0

        for (let i = 0; i < tagWidths.length; i++) {
          const gap = i > 0 ? GAP_PX : 0
          const tagWidth = tagWidths[i]

          if (usedWidth + gap + tagWidth + overflowWidth <= containerWidth) {
            usedWidth += gap + tagWidth
            fullCount = i + 1
          } else {
            break
          }
        }

        if (fullCount < tags.length) {
          // Whatever comes right after the last full badge: is it the only
          // tag left (no overflow badge needed) or are there more behind it?
          const pillNeeded = fullCount < tags.length - 1
          const gapBeforeNext = fullCount > 0 ? GAP_PX : 0
          const budget = containerWidth - usedWidth - gapBeforeNext - (pillNeeded ? overflowWidth : 0)

          if (budget >= MIN_TRUNCATED_PX) truncatedWidth = budget
        }
      }

      const visibleCount = truncatedWidth != null ? fullCount + 1 : fullCount

      // Apply visibility/width directly so React doesn't need another paint cycle.
      tagEls.forEach((el, i) => {
        const badgeEl = el.firstElementChild as HTMLElement | null
        if (i < fullCount) {
          el.style.display = ""
        } else if (truncatedWidth != null && i === fullCount) {
          el.style.display = ""
          if (badgeEl) badgeEl.style.maxWidth = `${truncatedWidth}px`
        } else {
          el.style.display = "none"
        }
      })
      if (overflowEl) {
        overflowEl.style.display = visibleCount < tags.length ? "inline-flex" : "none"
      }

      setLayout({ visibleCount, truncatedWidth })
    }

    const observer = new ResizeObserver(measure)
    observer.observe(container)
    measure()

    return () => observer.disconnect()
  }, [sorted, wrap])

  if (tags.length === 0) return null

  if (wrap) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {sorted.map((tag) => (
          <TagBadge key={tag} tag={tag} />
        ))}
      </div>
    )
  }

  const { visibleCount, truncatedWidth } = layout
  const hasOverflow = visibleCount < sorted.length
  const hiddenTags = sorted.slice(visibleCount)

  return (
    <div ref={containerRef} className="flex items-center gap-1 overflow-hidden min-w-0">
      {sorted.map((tag, i) => (
        <span key={tag} data-tag-item="" style={{ display: i >= visibleCount ? "none" : undefined }}>
          {truncatedWidth != null && i === visibleCount - 1 ? (
            <TagBadge tag={tag} maxWidthPx={truncatedWidth} />
          ) : (
            <TagBadge tag={tag} />
          )}
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
        <TagBadgeList tags={hiddenTags} />
      </Tooltip>
    </div>
  )
})
