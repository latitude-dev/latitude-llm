import { Button, Icon, Tooltip, useMountEffect } from "@repo/ui"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { type ReactNode, type Ref, type RefObject, useImperativeHandle, useRef, useState } from "react"

export interface ScrollNavigatorHandle {
  navigate(direction: "up" | "down"): void
}

interface ScrollNavigatorProps {
  readonly scrollContainerRef?: RefObject<HTMLDivElement | null>
  readonly itemRefs: RefObject<(HTMLDivElement | null)[]>
  readonly prevLabel?: ReactNode
  readonly nextLabel?: ReactNode
  readonly ref?: Ref<ScrollNavigatorHandle> | undefined
}

type ItemMetric = {
  readonly top: number
  readonly bottom: number
}

type GapMetric = {
  readonly top: number
  readonly bottom: number
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getItemMetrics(refs: readonly (HTMLDivElement | null)[], container: HTMLDivElement): ItemMetric[] {
  const containerRect = container.getBoundingClientRect()

  return refs.reduce<ItemMetric[]>((acc, el) => {
    if (!el) return acc

    const rect = el.getBoundingClientRect()
    acc.push({
      top: rect.top - containerRect.top + container.scrollTop,
      bottom: rect.bottom - containerRect.top + container.scrollTop,
    })
    return acc
  }, [])
}

function getGapMetrics(metrics: readonly ItemMetric[]): GapMetric[] {
  const gaps: GapMetric[] = []

  for (let i = 0; i < metrics.length - 1; i++) {
    gaps.push({
      top: metrics[i].bottom,
      bottom: metrics[i + 1].top,
    })
  }

  return gaps
}

function isWithinRange(value: number, start: number, end: number, epsilon: number) {
  return value >= start - epsilon && value <= end + epsilon
}

function NavigatorButtons({
  canScrollUp,
  canScrollDown,
  onPrevious,
  onNext,
  prevLabel,
  nextLabel,
}: {
  readonly canScrollUp: boolean
  readonly canScrollDown: boolean
  readonly onPrevious: () => void
  readonly onNext: () => void
  readonly prevLabel?: ReactNode
  readonly nextLabel?: ReactNode
}) {
  return (
    <div className="sticky bottom-4 z-10 self-end">
      <div className="flex flex-row items-center gap-1.5">
        <Tooltip
          side="top"
          trigger={
            <Button
              flat
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full shadow-sm"
              disabled={!canScrollUp}
              onClick={onPrevious}
            >
              <Icon icon={ChevronUpIcon} size="sm" />
            </Button>
          }
        >
          {prevLabel ?? "Previous"}
        </Tooltip>

        <Tooltip
          side="top"
          trigger={
            <Button
              flat
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full shadow-sm"
              disabled={!canScrollDown}
              onClick={onNext}
            >
              <Icon icon={ChevronDownIcon} size="sm" />
            </Button>
          }
        >
          {nextLabel ?? "Next"}
        </Tooltip>
      </div>
    </div>
  )
}

export function ScrollNavigator({ scrollContainerRef, itemRefs, prevLabel, nextLabel, ref }: ScrollNavigatorProps) {
  const rafRef = useRef(0)
  const [hasOverflow, setHasOverflow] = useState(false)
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)

  const updateScrollStateRef = useRef<(() => void) | null>(null)

  updateScrollStateRef.current = () => {
    const container = scrollContainerRef?.current
    if (!container) {
      setHasOverflow(false)
      setCanScrollUp(false)
      setCanScrollDown(false)
      return
    }

    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
    const scrollTop = container.scrollTop
    const epsilon = 1

    setHasOverflow(maxScrollTop > epsilon)
    setCanScrollUp(scrollTop > epsilon)
    setCanScrollDown(scrollTop < maxScrollTop - epsilon)
  }

  useMountEffect(() => {
    const container = scrollContainerRef?.current
    if (!container) return

    const updateScrollState = () => {
      updateScrollStateRef.current?.()
    }

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(updateScrollState)
    }

    updateScrollState()

    container.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", updateScrollState)

    return () => {
      container.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", updateScrollState)
      cancelAnimationFrame(rafRef.current)
    }
  })

  const navigate = (direction: "up" | "down") => {
    const container = scrollContainerRef?.current
    if (!container) return

    const refs = itemRefs.current.filter(Boolean)
    if (refs.length === 0) return

    const metrics = getItemMetrics(refs, container)
    if (metrics.length === 0) return

    const gaps = getGapMetrics(metrics)
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
    const scrollTop = container.scrollTop
    const viewportTop = scrollTop
    const viewportBottom = scrollTop + container.clientHeight
    const epsilon = 2

    let targetTop = scrollTop

    if (direction === "down") {
      if (viewportBottom >= container.scrollHeight - epsilon) return

      let targetGap: GapMetric | null = null

      for (const gap of gaps) {
        const bottomIsOnThisGap = isWithinRange(viewportBottom, gap.top, gap.bottom, epsilon)

        if (bottomIsOnThisGap) continue
        if (gap.top > viewportBottom + epsilon) {
          targetGap = gap
          break
        }
      }

      if (targetGap) {
        targetTop = targetGap.bottom - container.clientHeight
      } else {
        targetTop = maxScrollTop
      }
    } else {
      if (viewportTop <= epsilon) return

      let targetGap: GapMetric | null = null

      for (let i = gaps.length - 1; i >= 0; i--) {
        const gap = gaps[i]
        const topIsOnThisGap = isWithinRange(viewportTop, gap.top, gap.bottom, epsilon)

        if (topIsOnThisGap) continue
        if (gap.bottom < viewportTop - epsilon) {
          targetGap = gap
          break
        }
      }

      if (targetGap) {
        targetTop = targetGap.top
      } else {
        targetTop = 0
      }
    }

    targetTop = clamp(targetTop, 0, maxScrollTop)

    if (Math.abs(targetTop - scrollTop) <= 1) return

    container.scrollTo({
      top: targetTop,
      behavior: "smooth",
    })
  }

  useImperativeHandle(ref, () => ({ navigate }))

  if (!hasOverflow) {
    return null
  }

  return (
    <NavigatorButtons
      canScrollUp={canScrollUp}
      canScrollDown={canScrollDown}
      onPrevious={() => navigate("up")}
      onNext={() => navigate("down")}
      prevLabel={prevLabel}
      nextLabel={nextLabel}
    />
  )
}
