import { Button, Icon, Tooltip, useMountEffect } from "@repo/ui"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { type ReactNode, type Ref, type RefObject, useImperativeHandle, useRef, useState } from "react"

type ScrollDirection = "up" | "down"

export interface ScrollNavigatorHandle {
  navigate(direction: ScrollDirection): void
}

interface ScrollNavigatorProps {
  readonly scrollContainerRef?: RefObject<HTMLDivElement | null>
  readonly itemRefs: RefObject<(HTMLDivElement | null)[]>
  readonly prevLabel?: ReactNode
  readonly nextLabel?: ReactNode
  readonly scrollPaddingTop?: number
  readonly ref?: Ref<ScrollNavigatorHandle> | undefined
}

type ItemMetric = {
  readonly top: number
  readonly bottom: number
}

type NavigationTarget = {
  readonly index: number
  readonly top: number
}

type ResolveNavigationTargetArgs = {
  readonly metrics: readonly ItemMetric[]
  readonly scrollTop: number
  readonly clientHeight: number
  readonly scrollHeight: number
  readonly direction: ScrollDirection
  readonly scrollPaddingTop?: number
  readonly fromIndex?: number
  readonly epsilon?: number
}

const DEFAULT_SCROLL_PADDING_TOP = 16
const NAVIGATION_EPSILON = 2
const PENDING_TARGET_RESET_DELAY_MS = 120

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

function getCurrentItemIndex(metrics: readonly ItemMetric[], scrollTop: number, epsilon: number) {
  const currentIndex = metrics.findIndex((metric) => metric.bottom > scrollTop + epsilon)
  return currentIndex >= 0 ? currentIndex : metrics.length - 1
}

function resolveTargetTop({
  metrics,
  targetIndex,
  clientHeight,
  scrollHeight,
  scrollPaddingTop,
}: {
  readonly metrics: readonly ItemMetric[]
  readonly targetIndex: number
  readonly clientHeight: number
  readonly scrollHeight: number
  readonly scrollPaddingTop: number
}) {
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight)
  const targetItem = metrics[targetIndex]

  if (!targetItem) return clamp(targetIndex <= 0 ? 0 : maxScrollTop, 0, maxScrollTop)

  return clamp(targetItem.top - scrollPaddingTop, 0, maxScrollTop)
}

export function resolveNavigationTarget({
  metrics,
  scrollTop,
  clientHeight,
  scrollHeight,
  direction,
  scrollPaddingTop = DEFAULT_SCROLL_PADDING_TOP,
  fromIndex,
  epsilon = NAVIGATION_EPSILON,
}: ResolveNavigationTargetArgs) {
  if (metrics.length === 0) return null

  const lastIndex = metrics.length - 1
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight)
  if (fromIndex !== undefined) {
    const baseIndex = clamp(fromIndex, 0, lastIndex)

    if (direction === "down") {
      const targetIndex = Math.min(baseIndex + 1, lastIndex)
      return {
        index: targetIndex,
        top:
          baseIndex === lastIndex
            ? maxScrollTop
            : resolveTargetTop({
                metrics,
                targetIndex,
                clientHeight,
                scrollHeight,
                scrollPaddingTop,
              }),
      } satisfies NavigationTarget
    }

    const targetIndex = Math.max(baseIndex - 1, 0)
    return {
      index: targetIndex,
      top:
        baseIndex === 0
          ? 0
          : resolveTargetTop({
              metrics,
              targetIndex,
              clientHeight,
              scrollHeight,
              scrollPaddingTop,
            }),
    } satisfies NavigationTarget
  }

  const currentIndex = getCurrentItemIndex(metrics, scrollTop, epsilon)
  const currentItem = metrics[currentIndex]

  if (!currentItem) return null

  const isTopOverflowing = currentItem.top < scrollTop - epsilon

  if (direction === "down") {
    if (currentIndex >= lastIndex) {
      return { index: lastIndex, top: maxScrollTop } satisfies NavigationTarget
    }

    const targetIndex = currentIndex + 1
    return {
      index: targetIndex,
      top: resolveTargetTop({
        metrics,
        targetIndex,
        clientHeight,
        scrollHeight,
        scrollPaddingTop,
      }),
    } satisfies NavigationTarget
  }

  if (isTopOverflowing) {
    return {
      index: currentIndex,
      top: resolveTargetTop({
        metrics,
        targetIndex: currentIndex,
        clientHeight,
        scrollHeight,
        scrollPaddingTop,
      }),
    } satisfies NavigationTarget
  }

  if (currentIndex <= 0) {
    return { index: 0, top: 0 } satisfies NavigationTarget
  }

  const targetIndex = currentIndex - 1
  return {
    index: targetIndex,
    top: resolveTargetTop({
      metrics,
      targetIndex,
      clientHeight,
      scrollHeight,
      scrollPaddingTop,
    }),
  } satisfies NavigationTarget
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
    <div className="flex flex-row items-center gap-1.5">
      <Tooltip
        side="bottom"
        asChild
        trigger={
          <Button
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
        side="bottom"
        asChild
        trigger={
          <Button
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
  )
}

export function ScrollNavigator({
  scrollContainerRef,
  itemRefs,
  prevLabel,
  nextLabel,
  scrollPaddingTop = DEFAULT_SCROLL_PADDING_TOP,
  ref,
}: ScrollNavigatorProps) {
  const scrollStateRafRef = useRef(0)
  const pendingTargetRef = useRef<NavigationTarget | null>(null)
  const pendingTargetResetTimeoutRef = useRef<number | null>(null)
  const [hasOverflow, setHasOverflow] = useState(false)
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)

  const updateScrollStateRef = useRef<(() => void) | null>(null)

  const clearPendingTarget = () => {
    pendingTargetRef.current = null

    if (pendingTargetResetTimeoutRef.current !== null) {
      window.clearTimeout(pendingTargetResetTimeoutRef.current)
      pendingTargetResetTimeoutRef.current = null
    }
  }

  const schedulePendingTargetReset = () => {
    if (pendingTargetResetTimeoutRef.current !== null) {
      window.clearTimeout(pendingTargetResetTimeoutRef.current)
    }

    pendingTargetResetTimeoutRef.current = window.setTimeout(() => {
      pendingTargetResetTimeoutRef.current = null
      pendingTargetRef.current = null
    }, PENDING_TARGET_RESET_DELAY_MS)
  }

  updateScrollStateRef.current = () => {
    const container = scrollContainerRef?.current
    if (!container) {
      clearPendingTarget()
      setHasOverflow(false)
      setCanScrollUp(false)
      setCanScrollDown(false)
      return
    }

    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
    const scrollTop = container.scrollTop
    const epsilon = 1

    if (pendingTargetRef.current) {
      if (Math.abs(scrollTop - pendingTargetRef.current.top) <= epsilon) {
        clearPendingTarget()
      } else {
        schedulePendingTargetReset()
      }
    }

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
      cancelAnimationFrame(scrollStateRafRef.current)
      scrollStateRafRef.current = requestAnimationFrame(updateScrollState)
    }

    const onResize = () => {
      clearPendingTarget()
      updateScrollState()
    }

    updateScrollState()

    container.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onResize)

    return () => {
      container.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
      clearPendingTarget()
      cancelAnimationFrame(scrollStateRafRef.current)
    }
  })

  const navigate = (direction: ScrollDirection) => {
    const container = scrollContainerRef?.current
    if (!container) return

    const refs = itemRefs.current.filter(Boolean)
    if (refs.length === 0) return

    const metrics = getItemMetrics(refs, container)
    if (metrics.length === 0) return

    const scrollTop = container.scrollTop
    const pendingTarget = pendingTargetRef.current
    const activePendingTarget = pendingTarget && Math.abs(scrollTop - pendingTarget.top) > 1 ? pendingTarget : null

    if (pendingTarget && !activePendingTarget) {
      clearPendingTarget()
    }

    const target = resolveNavigationTarget({
      metrics,
      scrollTop,
      clientHeight: container.clientHeight,
      scrollHeight: container.scrollHeight,
      direction,
      scrollPaddingTop,
      ...(activePendingTarget ? { fromIndex: activePendingTarget.index } : {}),
    })

    if (target === null) return

    if (Math.abs(target.top - scrollTop) <= 1) {
      clearPendingTarget()
      return
    }

    pendingTargetRef.current = target
    schedulePendingTargetReset()

    container.scrollTo({
      top: target.top,
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
