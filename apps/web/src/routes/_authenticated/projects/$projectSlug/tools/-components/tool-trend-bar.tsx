import type { ToolCallHistogramBucket } from "@domain/spans"
import { Text, TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { useMemo } from "react"
import { formatBucketLabel } from "./tool-formatters.ts"

const DEFAULT_BAR_CLASSES = "bg-muted-foreground/60 dark:bg-muted-foreground/70"
const ERROR_BAR_CLASSES = "bg-rose-600/75 dark:bg-rose-400/85"
const MIN_VISIBLE_HEIGHT_PERCENT = 6

/**
 * Densifies sparse buckets over [fromMs, toMs] so quiet periods render as
 * gaps instead of compressing the timeline.
 */
function denseBuckets(
  buckets: readonly ToolCallHistogramBucket[],
  fromMs: number,
  toMs: number,
  bucketSeconds: number,
): readonly ToolCallHistogramBucket[] {
  const bucketMs = bucketSeconds * 1000
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return buckets
  const byStart = new Map(buckets.map((bucket) => [Date.parse(bucket.bucketStart), bucket]))
  const firstBucketMs = Math.floor(fromMs / bucketMs) * bucketMs
  const result: ToolCallHistogramBucket[] = []
  for (let startMs = firstBucketMs; startMs <= toMs; startMs += bucketMs) {
    result.push(
      byStart.get(startMs) ?? {
        bucketStart: new Date(startMs).toISOString(),
        calls: 0,
        errors: 0,
        p50DurationNs: 0,
      },
    )
  }
  return result
}

// Pure-div sparkline — deliberately not an ECharts instance, since the list
// renders one of these per row.
export function ToolTrendBar({
  buckets,
  fromIso,
  toIso,
  bucketSeconds,
  height = 36,
}: {
  readonly buckets: readonly ToolCallHistogramBucket[]
  readonly fromIso: string
  readonly toIso: string
  readonly bucketSeconds: number
  readonly height?: number
}) {
  const visualBuckets = useMemo(
    () => denseBuckets(buckets, Date.parse(fromIso), Date.parse(toIso), bucketSeconds),
    [buckets, fromIso, toIso, bucketSeconds],
  )
  const maxCalls = useMemo(() => Math.max(1, ...visualBuckets.map((bucket) => bucket.calls)), [visualBuckets])

  if (buckets.length === 0 || buckets.every((bucket) => bucket.calls === 0)) {
    return (
      <div className="flex min-h-9 items-center">
        <Text.H6 color="foregroundMuted">-</Text.H6>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col" style={{ height }} role="img" aria-label="Tool calls trend">
      <TooltipProvider>
        <div className="flex h-full items-end gap-px">
          {visualBuckets.map((bucket) => {
            const heightPercent =
              bucket.calls === 0 ? 0 : Math.max(MIN_VISIBLE_HEIGHT_PERCENT, Math.round((bucket.calls / maxCalls) * 100))
            return (
              <TooltipRoot key={bucket.bucketStart} delayDuration={100}>
                <TooltipTrigger asChild>
                  <span className="group/bucket relative flex h-full min-w-0 flex-1 items-end">
                    <span
                      className="pointer-events-none absolute inset-0 rounded-[2px] bg-foreground/[0.06] opacity-0 transition-opacity group-hover/bucket:opacity-100"
                      aria-hidden
                    />
                    <span
                      className={`relative w-full rounded-t-[2px] ${bucket.errors > 0 ? ERROR_BAR_CLASSES : DEFAULT_BAR_CLASSES}`}
                      style={{ height: `${heightPercent}%` }}
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  <div className="flex flex-col gap-0.5">
                    <Text.H6>{formatBucketLabel(bucket.bucketStart, bucketSeconds)}</Text.H6>
                    <Text.H6B>{formatCount(bucket.calls)} calls</Text.H6B>
                    {bucket.errors > 0 ? (
                      <Text.H6 color="foregroundMuted">{formatCount(bucket.errors)} failed</Text.H6>
                    ) : null}
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
