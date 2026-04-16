import { cn, Text } from "@repo/ui"
import { useCallback, useMemo, useState } from "react"
import type { SpanRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"
import { statusBarColor, WATERFALL_H_INSET_PX } from "./helpers.ts"
import type { TraceTimeRange } from "./tree-utils.ts"
import { formatDuration } from "./tree-utils.ts"

export function WaterfallBar({ span, timeRange }: { readonly span: SpanRecord; readonly timeRange: TraceTimeRange }) {
  const start = new Date(span.startTime).getTime()
  const end = new Date(span.endTime).getTime()

  if (timeRange.totalDuration === 0) {
    return (
      <div className="absolute inset-y-1 left-0 right-0">
        <div className={cn("h-full rounded-sm", statusBarColor(span.statusCode))} />
      </div>
    )
  }

  const leftPct = ((start - timeRange.minTime) / timeRange.totalDuration) * 100
  const widthPct = Math.max(((end - start) / timeRange.totalDuration) * 100, 0.4)

  return (
    <div className="absolute inset-y-1.5" style={{ left: `${leftPct}%`, width: `${widthPct}%` }}>
      <div className={cn("h-full rounded-sm min-w-[2px]", statusBarColor(span.statusCode))} />
    </div>
  )
}

export function useWaterfallCursor({
  containerRef,
  treeWidth,
  timeRange,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
  treeWidth: number
  timeRange: TraceTimeRange
}) {
  const [cursorX, setCursorX] = useState<number | null>(null)

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const waterfallStart = treeWidth + 1
      const relX = x - waterfallStart
      const waterfallWidth = containerRef.current.offsetWidth - treeWidth - 1
      const g = WATERFALL_H_INSET_PX
      const trackWidth = waterfallWidth - 2 * g
      if (relX < 0 || waterfallWidth <= 0 || trackWidth <= 0) {
        setCursorX(null)
        return
      }
      if (relX >= g && relX <= waterfallWidth - g) {
        setCursorX(relX)
      } else {
        setCursorX(null)
      }
    },
    [containerRef, treeWidth],
  )

  const onMouseLeave = useCallback(() => setCursorX(null), [])

  const cursorTimeLabel = useMemo(() => {
    if (cursorX === null || !containerRef.current || timeRange.totalDuration === 0) return null
    const waterfallWidth = containerRef.current.offsetWidth - treeWidth - 1
    const g = WATERFALL_H_INSET_PX
    const trackWidth = waterfallWidth - 2 * g
    if (waterfallWidth <= 0 || trackWidth <= 0) return null
    const fraction = (cursorX - g) / trackWidth
    return formatDuration(fraction * timeRange.totalDuration)
  }, [cursorX, containerRef, treeWidth, timeRange])

  return { cursorX, cursorTimeLabel, onMouseMove, onMouseLeave }
}

export function WaterfallCursorOverlay({
  treeWidth,
  cursorX,
  cursorTimeLabel,
}: {
  readonly treeWidth: number
  readonly cursorX: number | null
  readonly cursorTimeLabel: string | null
}) {
  if (cursorX === null) return null

  return (
    <div className="absolute top-0 bottom-0 pointer-events-none z-20" style={{ left: treeWidth + 1, right: 0 }}>
      <div className="absolute top-0 bottom-0 w-px bg-muted-foreground/40" style={{ left: cursorX }} />
      {cursorTimeLabel && (
        <div className="absolute top-1 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5" style={{ left: cursorX }}>
          <Text.H6 color="background">{cursorTimeLabel}</Text.H6>
        </div>
      )}
    </div>
  )
}
