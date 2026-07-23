import { Text, TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { useMemo } from "react"
import { formatBucketLabel } from "./memory-formatters.ts"

export interface MemoryTrendPoint {
  readonly bucketStart: string
  readonly writes: number
  readonly reads: number
}

const WRITE_BAR_CLASSES = "bg-muted-foreground/60 dark:bg-muted-foreground/70"
const READ_BAR_CLASSES = "bg-sky-500/70 dark:bg-sky-400/80"
const MIN_VISIBLE_HEIGHT_PERCENT = 6

// Fills quiet periods with empty buckets so gaps render as gaps, not compression.
function denseBuckets(
  points: readonly MemoryTrendPoint[],
  fromMs: number,
  toMs: number,
  bucketSeconds: number,
): readonly MemoryTrendPoint[] {
  const bucketMs = bucketSeconds * 1000
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return points
  const byStart = new Map(points.map((point) => [Date.parse(point.bucketStart), point]))
  const firstBucketMs = Math.floor(fromMs / bucketMs) * bucketMs
  const result: MemoryTrendPoint[] = []
  for (let startMs = firstBucketMs; startMs <= toMs; startMs += bucketMs) {
    result.push(byStart.get(startMs) ?? { bucketStart: new Date(startMs).toISOString(), writes: 0, reads: 0 })
  }
  return result
}

// Pure-div sparkline (one per store row) — writes and reads stacked per bucket.
export function MemoryTrendBar({
  points,
  fromIso,
  toIso,
  bucketSeconds,
  height = 36,
}: {
  readonly points: readonly MemoryTrendPoint[]
  readonly fromIso: string
  readonly toIso: string
  readonly bucketSeconds: number
  readonly height?: number
}) {
  const visualBuckets = useMemo(
    () => denseBuckets(points, Date.parse(fromIso), Date.parse(toIso), bucketSeconds),
    [points, fromIso, toIso, bucketSeconds],
  )
  const maxTotal = useMemo(
    () => Math.max(1, ...visualBuckets.map((bucket) => bucket.writes + bucket.reads)),
    [visualBuckets],
  )

  if (points.length === 0 || points.every((point) => point.writes === 0 && point.reads === 0)) {
    return (
      <div className="flex min-h-9 items-center">
        <Text.H6 color="foregroundMuted">-</Text.H6>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col" style={{ height }} role="img" aria-label="Memory activity trend">
      <TooltipProvider>
        <div className="flex h-full items-end gap-px">
          {visualBuckets.map((bucket) => {
            const total = bucket.writes + bucket.reads
            const totalPercent =
              total === 0 ? 0 : Math.max(MIN_VISIBLE_HEIGHT_PERCENT, Math.round((total / maxTotal) * 100))
            const readShare = total === 0 ? 0 : bucket.reads / total
            return (
              <TooltipRoot key={bucket.bucketStart} delayDuration={100}>
                <TooltipTrigger asChild>
                  <span className="group/bucket relative flex h-full min-w-0 flex-1 items-end">
                    <span
                      className="pointer-events-none absolute inset-0 rounded-[2px] bg-foreground/[0.06] opacity-0 transition-opacity group-hover/bucket:opacity-100"
                      aria-hidden
                    />
                    <span
                      className="relative flex w-full flex-col justify-end overflow-hidden rounded-t-[2px]"
                      style={{ height: `${totalPercent}%` }}
                    >
                      <span className={READ_BAR_CLASSES} style={{ height: `${Math.round(readShare * 100)}%` }} />
                      <span className={WRITE_BAR_CLASSES} style={{ height: `${Math.round((1 - readShare) * 100)}%` }} />
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  <div className="flex flex-col gap-0.5">
                    <Text.H6>{formatBucketLabel(bucket.bucketStart, bucketSeconds)}</Text.H6>
                    <Text.H6B>{formatCount(bucket.writes)} writes</Text.H6B>
                    <Text.H6 color="foregroundMuted">{formatCount(bucket.reads)} reads</Text.H6>
                  </div>
                </TooltipContent>
              </TooltipRoot>
            )
          })}
        </div>
      </TooltipProvider>
    </div>
  )
}
