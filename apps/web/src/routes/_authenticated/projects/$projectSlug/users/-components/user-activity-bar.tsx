import { ChartSkeleton, Text, TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { formatBucketTooltipLabel } from "./user-formatters.ts"

const GUIDE_LINE_COUNT = 5
const TOP_INSET_PX = 6
const BAR_CLASSES = "bg-muted-foreground/60 dark:bg-muted-foreground/70"
const GUIDE_CLASSES = "border-border/60 dark:border-muted-foreground/30"
const DEFAULT_BUCKET_SECONDS = 24 * 60 * 60
/** Bars for non-zero buckets stay visible even when dwarfed by the max. */
const MIN_VISIBLE_HEIGHT_PERCENT = 6

export function UserActivityBar({
  buckets,
  height = 36,
  isLoading = false,
  emptyLabel = "-",
  bucketSeconds = DEFAULT_BUCKET_SECONDS,
}: {
  readonly buckets: readonly { readonly bucket: string; readonly count: number }[]
  readonly height?: number
  readonly isLoading?: boolean
  readonly emptyLabel?: string
  readonly bucketSeconds?: number
}) {
  if (isLoading) {
    return <ChartSkeleton minHeight={height} className="border-0 bg-transparent p-0" />
  }

  if (buckets.length === 0 || buckets.every((bucket) => bucket.count === 0)) {
    return (
      <div className="flex min-h-10 items-center">
        <Text.H6 color="foregroundMuted">{emptyLabel}</Text.H6>
      </div>
    )
  }

  const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 1)

  return (
    <div className="flex min-w-0 flex-col" style={{ height }} role="img" aria-label="User activity">
      <TooltipProvider>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-between"
            style={{ top: TOP_INSET_PX }}
            aria-hidden
          >
            {Array.from({ length: GUIDE_LINE_COUNT }, (_, index) => (
              <span
                key={index}
                className={
                  index === GUIDE_LINE_COUNT - 1
                    ? `w-full border-t ${GUIDE_CLASSES}`
                    : `w-full border-t border-dashed ${GUIDE_CLASSES}`
                }
              />
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-end gap-1" style={{ top: TOP_INSET_PX }}>
            {buckets.map((bucket) => {
              const heightPercent =
                bucket.count === 0 ? 0 : Math.max((bucket.count / maxCount) * 100, MIN_VISIBLE_HEIGHT_PERCENT)
              return (
                <TooltipRoot key={bucket.bucket} delayDuration={100}>
                  <TooltipTrigger asChild>
                    <span className="group/bucket relative flex h-full min-w-0 flex-1 items-end">
                      <span
                        className="pointer-events-none absolute inset-0 rounded-[2px] bg-foreground/[0.06] opacity-0 transition-opacity group-hover/bucket:opacity-100"
                        aria-hidden
                      />
                      <span
                        className={`relative z-[1] w-full rounded-t-[2px] transition-[filter] group-hover/bucket:brightness-90 ${BAR_CLASSES}`}
                        style={{ height: `${heightPercent}%` }}
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    <div className="flex flex-col gap-0.5">
                      <Text.H6>{formatBucketTooltipLabel(bucket.bucket, bucketSeconds)}</Text.H6>
                      <Text.H6B>{formatCount(bucket.count)} traces</Text.H6B>
                    </div>
                  </TooltipContent>
                </TooltipRoot>
              )
            })}
          </div>
        </div>
      </TooltipProvider>
    </div>
  )
}
