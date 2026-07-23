import { Text, TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { useMemo } from "react"
import type { MemoryActivityWriteBucketRecord } from "../../../../../../domains/memories/memories.functions.ts"
import { formatBucketLabel } from "./memory-formatters.ts"

const BAR_CLASSES = "bg-muted-foreground/60 dark:bg-muted-foreground/70"
const MIN_VISIBLE_HEIGHT_PERCENT = 6

// Densifies sparse buckets over [fromMs, toMs] so quiet periods render as gaps
// instead of compressing the timeline.
function denseBuckets(
  buckets: readonly MemoryActivityWriteBucketRecord[],
  fromMs: number,
  toMs: number,
  bucketSeconds: number,
): readonly MemoryActivityWriteBucketRecord[] {
  const bucketMs = bucketSeconds * 1000
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return buckets
  const byStart = new Map(buckets.map((bucket) => [Date.parse(bucket.bucketStart), bucket]))
  const firstBucketMs = Math.floor(fromMs / bucketMs) * bucketMs
  const result: MemoryActivityWriteBucketRecord[] = []
  for (let startMs = firstBucketMs; startMs <= toMs; startMs += bucketMs) {
    result.push(byStart.get(startMs) ?? { bucketStart: new Date(startMs).toISOString(), writes: 0 })
  }
  return result
}

// Pure-div sparkline of writes per bucket — deliberately not an ECharts
// instance, since the list renders one of these per row.
export function MemoryTrendBar({
  buckets,
  fromIso,
  toIso,
  bucketSeconds,
  height = 36,
}: {
  readonly buckets: readonly MemoryActivityWriteBucketRecord[]
  readonly fromIso: string
  readonly toIso: string
  readonly bucketSeconds: number
  readonly height?: number
}) {
  const visualBuckets = useMemo(
    () => denseBuckets(buckets, Date.parse(fromIso), Date.parse(toIso), bucketSeconds),
    [buckets, fromIso, toIso, bucketSeconds],
  )
  const maxWrites = useMemo(() => Math.max(1, ...visualBuckets.map((bucket) => bucket.writes)), [visualBuckets])

  if (buckets.length === 0 || buckets.every((bucket) => bucket.writes === 0)) {
    return (
      <div className="flex min-h-9 items-center">
        <Text.H6 color="foregroundMuted">-</Text.H6>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col" style={{ height }} role="img" aria-label="Memory writes trend">
      <TooltipProvider>
        <div className="flex h-full items-end gap-px">
          {visualBuckets.map((bucket) => {
            const heightPercent =
              bucket.writes === 0
                ? 0
                : Math.max(MIN_VISIBLE_HEIGHT_PERCENT, Math.round((bucket.writes / maxWrites) * 100))
            return (
              <TooltipRoot key={bucket.bucketStart} delayDuration={100}>
                <TooltipTrigger asChild>
                  <span className="group/bucket relative flex h-full min-w-0 flex-1 items-end">
                    <span
                      className="pointer-events-none absolute inset-0 rounded-[2px] bg-foreground/[0.06] opacity-0 transition-opacity group-hover/bucket:opacity-100"
                      aria-hidden
                    />
                    <span
                      className={`relative w-full rounded-t-[2px] ${BAR_CLASSES}`}
                      style={{ height: `${heightPercent}%` }}
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  <div className="flex flex-col gap-0.5">
                    <Text.H6>{formatBucketLabel(bucket.bucketStart, bucketSeconds)}</Text.H6>
                    <Text.H6B>{formatCount(bucket.writes)} writes</Text.H6B>
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
