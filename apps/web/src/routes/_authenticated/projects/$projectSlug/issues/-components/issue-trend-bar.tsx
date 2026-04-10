import { ChartSkeleton, Text, TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { formatDayBucketLabel, formatDayBucketTooltipLabel } from "./issue-formatters.ts"

const MAX_VISIBLE_BUCKET_LABELS = 6
const MIN_VISIBLE_BAR_HEIGHT_PERCENT = 12

function shouldShowBucketLabel(index: number, totalBuckets: number) {
  if (totalBuckets <= MAX_VISIBLE_BUCKET_LABELS) {
    return true
  }

  const interval = Math.max(1, Math.ceil(totalBuckets / MAX_VISIBLE_BUCKET_LABELS))
  return index % interval === 0 || index === totalBuckets - 1
}

export function IssueTrendBar({
  buckets,
  height = 48,
  isLoading = false,
  emptyLabel = "No issue occurrences",
  showLabels = true,
}: {
  readonly buckets: readonly { readonly bucket: string; readonly count: number }[]
  readonly height?: number
  readonly isLoading?: boolean
  readonly emptyLabel?: string
  readonly showLabels?: boolean
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

  const chartBuckets = buckets.map((bucket) => ({
    key: bucket.bucket,
    label: formatDayBucketLabel(bucket.bucket),
    tooltipLabel: formatDayBucketTooltipLabel(bucket.bucket),
    count: bucket.count,
  }))
  const maxCount = Math.max(...chartBuckets.map((bucket) => bucket.count), 1)

  return (
    <div className="flex min-w-0 flex-col" style={{ height }} role="img" aria-label="Issue occurrence trend">
      <TooltipProvider>
        <div className="flex min-h-0 flex-1 items-end gap-1">
          {chartBuckets.map((bucket) => {
            const heightPercent =
              bucket.count === 0 ? 0 : Math.max(MIN_VISIBLE_BAR_HEIGHT_PERCENT, (bucket.count / maxCount) * 100)

            return (
              <TooltipRoot key={bucket.key} delayDuration={100}>
                <TooltipTrigger asChild>
                  <span className="group/bucket flex h-full min-w-0 flex-1 items-end">
                    <span
                      className="w-full rounded-t-sm bg-primary transition-opacity group-hover/bucket:opacity-80"
                      style={{ height: `${heightPercent}%` }}
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  <div className="flex flex-col gap-0.5">
                    <Text.H6>{bucket.tooltipLabel}</Text.H6>
                    <Text.H6B>{formatCount(bucket.count)} occurrences</Text.H6B>
                  </div>
                </TooltipContent>
              </TooltipRoot>
            )
          })}
        </div>
      </TooltipProvider>
      {showLabels ? (
        <div className="flex min-w-0 items-start gap-1 pt-1">
          {chartBuckets.map((bucket, index) => (
            <div key={bucket.key} className="min-w-0 flex-1 text-center">
              {shouldShowBucketLabel(index, chartBuckets.length) ? (
                <Text.H6 className="truncate" color="foregroundMuted">
                  {bucket.label}
                </Text.H6>
              ) : (
                <span aria-hidden className="block h-4" />
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
