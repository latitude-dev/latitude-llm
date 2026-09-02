import { SCORE_DIMENSIONS, type ScoreDimension } from "@domain/shared"
import type { SignalScoreEvidence } from "@domain/signals"
import { Badge, Text, Tooltip } from "@repo/ui"
import { useLayoutEffect, useMemo, useRef, useState } from "react"

const BADGE_GAP_PX = 4

export const SIGNAL_SCORE_DIMENSION_LABELS = {
  outcome: "Outcome",
  reliability: "Reliability",
  cost: "Cost",
  speed: "Speed",
  safety: "Safety",
} satisfies Record<ScoreDimension, string>

function getSignalScoreDimensions(scoreEvidence: readonly SignalScoreEvidence[]): readonly ScoreDimension[] {
  const dimensions = new Set(scoreEvidence.map((evidence) => evidence.scoreDimension))
  return SCORE_DIMENSIONS.filter((dimension) => dimensions.has(dimension))
}

export function SignalScoreDimensions({
  scoreEvidence,
  wrap = true,
}: {
  readonly scoreEvidence: readonly SignalScoreEvidence[]
  readonly wrap?: boolean
}) {
  const dimensions = useMemo(() => getSignalScoreDimensions(scoreEvidence), [scoreEvidence])
  const containerRef = useRef<HTMLUListElement>(null)
  const [visibleCount, setVisibleCount] = useState(dimensions.length)

  useLayoutEffect(() => {
    if (wrap || dimensions.length === 0) return
    const container = containerRef.current
    if (!container) return

    const measure = () => {
      const badges = Array.from(container.querySelectorAll<HTMLElement>("[data-dimension-item]"))
      const overflowBadge = container.querySelector<HTMLElement>("[data-dimension-overflow]")

      badges.forEach((badge) => {
        badge.style.display = ""
      })
      if (overflowBadge) overflowBadge.style.display = "inline-flex"

      const containerWidth = container.offsetWidth
      const overflowWidth = overflowBadge ? overflowBadge.offsetWidth : 0
      const badgeWidths = badges.map((badge) => badge.offsetWidth)
      const totalWidth = badgeWidths.reduce((width, badgeWidth, index) => {
        return width + (index > 0 ? BADGE_GAP_PX : 0) + badgeWidth
      }, 0)

      let nextVisibleCount = dimensions.length
      if (totalWidth > containerWidth) {
        let usedWidth = 0
        nextVisibleCount = 0

        for (let index = 0; index < badgeWidths.length; index++) {
          const gap = index > 0 ? BADGE_GAP_PX : 0
          const badgeWidth = badgeWidths[index] ?? 0
          const hasHiddenBadges = index < badgeWidths.length - 1
          const reservedOverflowWidth = hasHiddenBadges ? BADGE_GAP_PX + overflowWidth : 0

          if (usedWidth + gap + badgeWidth + reservedOverflowWidth > containerWidth) break

          usedWidth += gap + badgeWidth
          nextVisibleCount = index + 1
        }
      }

      badges.forEach((badge, index) => {
        badge.style.display = index < nextVisibleCount ? "" : "none"
      })
      if (overflowBadge) {
        overflowBadge.style.display = nextVisibleCount < dimensions.length ? "inline-flex" : "none"
      }
      setVisibleCount(nextVisibleCount)
    }

    const observer = new ResizeObserver(measure)
    observer.observe(container)
    measure()

    return () => observer.disconnect()
  }, [dimensions, wrap])

  if (dimensions.length === 0) {
    return (
      <Tooltip
        asChild
        trigger={
          <Badge variant="muted" noWrap className="cursor-default font-normal">
            Diagnostic
          </Badge>
        }
      >
        <Text.H6>Does not contribute to Agent Score.</Text.H6>
      </Tooltip>
    )
  }

  const hiddenDimensions = dimensions.slice(visibleCount)

  return (
    <ul
      ref={containerRef}
      aria-label="Agent Score dimensions"
      className={wrap ? "flex flex-row flex-wrap gap-1" : "flex min-w-0 flex-row items-center gap-1 overflow-hidden"}
    >
      {dimensions.map((dimension, index) => (
        <li
          key={dimension}
          data-dimension-item=""
          style={{ display: !wrap && index >= visibleCount ? "none" : undefined }}
        >
          <Badge variant="muted" noWrap className="font-normal">
            {SIGNAL_SCORE_DIMENSION_LABELS[dimension]}
          </Badge>
        </li>
      ))}
      {!wrap ? (
        <Tooltip
          asChild
          trigger={
            <li data-dimension-overflow="" style={{ display: hiddenDimensions.length > 0 ? "inline-flex" : "none" }}>
              <Badge variant="muted" noWrap className="font-normal">
                +{hiddenDimensions.length}
              </Badge>
            </li>
          }
        >
          <ul className="flex flex-row flex-wrap gap-1">
            {hiddenDimensions.map((dimension) => (
              <li key={dimension}>
                <Badge variant="muted" noWrap className="font-normal">
                  {SIGNAL_SCORE_DIMENSION_LABELS[dimension]}
                </Badge>
              </li>
            ))}
          </ul>
        </Tooltip>
      ) : null}
    </ul>
  )
}
