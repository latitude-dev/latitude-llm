import { ChartSkeleton, Text, TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { formatDayBucketLabel, formatDayBucketTooltipLabel } from "./issue-formatters.ts"

const DEFAULT_MAX_VISIBLE_BUCKET_LABELS = 6
const MIN_VISIBLE_BAR_HEIGHT_PERCENT = 12
const MAX_VISIBLE_BAR_HEIGHT_PERCENT = 88
const BAR_TOP_HEADROOM_PERCENT = 100 - MAX_VISIBLE_BAR_HEIGHT_PERCENT
const MINI_HISTOGRAM_GUIDE_LINE_COUNT = 5
const MINI_HISTOGRAM_TOP_INSET_PX = 6
const REGRESSED_BAR_CLASSES = "bg-rose-700 dark:bg-rose-400"
const ESCALATING_BAR_CLASSES = "bg-yellow-500/75 dark:bg-yellow-300/85"
const DEFAULT_MUTED_BAR_CLASSES = "bg-muted-foreground/60 dark:bg-muted-foreground/70"
const DEFAULT_BACKGROUND_GUIDE_CLASSES = "border-border/60 dark:border-muted-foreground/30"
const DEFAULT_MUTED_GUIDE_CLASSES = "border-muted-foreground/60 dark:border-muted-foreground/70"
const DEFAULT_PRIMARY_BAR_CLASSES = "bg-primary"

function toBucketEndMs(bucket: string): number {
  return new Date(`${bucket}T23:59:59.999Z`).getTime()
}

function resolveBarClasses(input: {
  readonly barVariant: "muted" | "primary"
  readonly isRegressedBucket: boolean
  readonly isEscalatingBucket: boolean
  readonly hasLifecycleHighlight: boolean
}) {
  if (input.isRegressedBucket) {
    return REGRESSED_BAR_CLASSES
  }

  if (input.isEscalatingBucket) {
    return ESCALATING_BAR_CLASSES
  }

  if (input.hasLifecycleHighlight) {
    return DEFAULT_MUTED_BAR_CLASSES
  }

  return input.barVariant === "primary" ? DEFAULT_PRIMARY_BAR_CLASSES : DEFAULT_MUTED_BAR_CLASSES
}

function getVisibleBucketLabelIndices(totalBuckets: number, maxVisibleBucketLabels: number): ReadonlySet<number> {
  if (totalBuckets <= 0) {
    return new Set()
  }

  if (totalBuckets <= maxVisibleBucketLabels) {
    return new Set(Array.from({ length: totalBuckets }, (_, index) => index))
  }

  const labelCount = Math.max(2, maxVisibleBucketLabels)
  return new Set(
    Array.from({ length: labelCount }, (_, index) => Math.round((index * (totalBuckets - 1)) / (labelCount - 1))),
  )
}

function toVisibleHeightPercent(count: number, maxCount: number): number {
  if (count === 0) {
    return 0
  }

  return Math.max(MIN_VISIBLE_BAR_HEIGHT_PERCENT, (count / maxCount) * MAX_VISIBLE_BAR_HEIGHT_PERCENT)
}

export function IssueTrendBar({
  buckets,
  height = 48,
  isLoading = false,
  emptyLabel = "No issue occurrences",
  showLabels = true,
  labelLayout = "bucket",
  maxVisibleBucketLabels = DEFAULT_MAX_VISIBLE_BUCKET_LABELS,
  barVariant = "muted",
  states = [],
  resolvedAt = null,
  escalationOccurrenceThreshold = null,
  showEscalationThresholdGuide = false,
}: {
  readonly buckets: readonly { readonly bucket: string; readonly count: number }[]
  readonly height?: number
  readonly isLoading?: boolean
  readonly emptyLabel?: string
  readonly showLabels?: boolean
  readonly labelLayout?: "bucket" | "floating"
  readonly maxVisibleBucketLabels?: number
  readonly barVariant?: "muted" | "primary"
  readonly states?: readonly string[]
  readonly resolvedAt?: string | null
  readonly escalationOccurrenceThreshold?: number | null
  readonly showEscalationThresholdGuide?: boolean
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
  const visibleBucketLabelIndices = getVisibleBucketLabelIndices(chartBuckets.length, maxVisibleBucketLabels)
  const maxCount = Math.max(...chartBuckets.map((bucket) => bucket.count), 1)
  const resolvedAtMs = resolvedAt ? new Date(resolvedAt).getTime() : null
  const resolvedDayBucketKey = resolvedAt ? resolvedAt.slice(0, 10) : null
  const isRegressedIssue = states.includes("regressed")
  const isEscalatingIssue = states.includes("escalating")
  const escalationGuideCount =
    showEscalationThresholdGuide && isEscalatingIssue && escalationOccurrenceThreshold !== null
      ? escalationOccurrenceThreshold
      : null
  const escalationGuideHeightPercent =
    escalationGuideCount !== null ? toVisibleHeightPercent(escalationGuideCount, maxCount) : null
  const escalationGuideBottomPercent =
    escalationGuideHeightPercent !== null ? Math.max(0, escalationGuideHeightPercent - BAR_TOP_HEADROOM_PERCENT) : null
  const visualBuckets = chartBuckets.map((bucket) => {
    const heightPercent = toVisibleHeightPercent(bucket.count, maxCount)
    const isRegressedBucket =
      isRegressedIssue && resolvedAtMs !== null && bucket.count > 0 && toBucketEndMs(bucket.key) > resolvedAtMs
    const isEscalatingBucket =
      !isRegressedBucket &&
      isEscalatingIssue &&
      escalationOccurrenceThreshold !== null &&
      bucket.count >= escalationOccurrenceThreshold

    return {
      ...bucket,
      heightPercent,
      isRegressedBucket,
      isEscalatingBucket,
      isResolvedBoundaryBucket:
        isRegressedIssue && resolvedDayBucketKey !== null && bucket.key === resolvedDayBucketKey,
    }
  })
  const hasLifecycleHighlight = visualBuckets.some((bucket) => bucket.isRegressedBucket || bucket.isEscalatingBucket)

  return (
    <div className="flex min-w-0 flex-col" style={{ height }} role="img" aria-label="Issue occurrence trend">
      <TooltipProvider>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-between"
            style={{ top: MINI_HISTOGRAM_TOP_INSET_PX }}
            aria-hidden
          >
            {Array.from({ length: MINI_HISTOGRAM_GUIDE_LINE_COUNT }, (_, index) => (
              <span
                key={index}
                className={
                  index === MINI_HISTOGRAM_GUIDE_LINE_COUNT - 1
                    ? `w-full border-t ${DEFAULT_BACKGROUND_GUIDE_CLASSES}`
                    : `w-full border-t border-dashed ${DEFAULT_BACKGROUND_GUIDE_CLASSES}`
                }
              />
            ))}
          </div>
          <div
            className="absolute inset-x-0 bottom-0 flex items-end gap-1"
            style={{ top: MINI_HISTOGRAM_TOP_INSET_PX }}
          >
            {visualBuckets.map((bucket) => {
              return (
                <TooltipRoot key={bucket.key} delayDuration={100}>
                  <TooltipTrigger asChild>
                    <span className="group/bucket relative flex h-full min-w-0 flex-1 items-end">
                      <span
                        className="pointer-events-none absolute inset-0 rounded-[2px] bg-foreground/[0.06] opacity-0 transition-opacity group-hover/bucket:opacity-100"
                        aria-hidden
                      />
                      {bucket.isResolvedBoundaryBucket ? (
                        <span
                          className={`pointer-events-none absolute bottom-0 top-0 left-1/2 z-[2] -translate-x-1/2 border-l border-dashed ${DEFAULT_MUTED_GUIDE_CLASSES}`}
                          aria-hidden
                        />
                      ) : null}
                      <span
                        className={`relative z-[1] w-full transition-[filter] group-hover/bucket:brightness-90 ${
                          barVariant === "primary"
                            ? `rounded-t-sm ${resolveBarClasses({
                                barVariant,
                                isRegressedBucket: bucket.isRegressedBucket,
                                isEscalatingBucket: bucket.isEscalatingBucket,
                                hasLifecycleHighlight,
                              })}`
                            : `rounded-t-[2px] ${resolveBarClasses({
                                barVariant,
                                isRegressedBucket: bucket.isRegressedBucket,
                                isEscalatingBucket: bucket.isEscalatingBucket,
                                hasLifecycleHighlight,
                              })}`
                        }`}
                        style={{ height: `${bucket.heightPercent}%` }}
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    <div className="flex flex-col gap-0.5">
                      <Text.H6>{bucket.tooltipLabel}</Text.H6>
                      {bucket.isResolvedBoundaryBucket ? (
                        <Text.H6 color="foregroundMuted">Issue was resolved</Text.H6>
                      ) : null}
                      <Text.H6B>{formatCount(bucket.count)} occurrences</Text.H6B>
                    </div>
                  </TooltipContent>
                </TooltipRoot>
              )
            })}
          </div>
          {escalationGuideCount !== null && escalationGuideBottomPercent !== null ? (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
              style={{ top: MINI_HISTOGRAM_TOP_INSET_PX }}
              aria-hidden
            >
              <div
                className={`absolute inset-x-0 border-t border-dashed ${DEFAULT_MUTED_GUIDE_CLASSES}`}
                style={{ bottom: `${escalationGuideBottomPercent}%` }}
              />
            </div>
          ) : null}
        </div>
      </TooltipProvider>
      {showLabels ? (
        labelLayout === "floating" ? (
          <div className="flex min-w-0 items-start gap-1 overflow-visible pt-1">
            {chartBuckets.map((bucket, index) => (
              <div key={bucket.key} className="relative h-5 min-w-0 flex-1 overflow-visible">
                {visibleBucketLabelIndices.has(index) ? (
                  <div className="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap">
                    <Text.H6 color="foregroundMuted" noWrap>
                      {bucket.label}
                    </Text.H6>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-w-0 items-start gap-1 pt-1">
            {chartBuckets.map((bucket, index) => (
              <div key={bucket.key} className="min-w-0 flex-1 text-center">
                {visibleBucketLabelIndices.has(index) ? (
                  <Text.H6 className="truncate" color="foregroundMuted" noWrap>
                    {bucket.label}
                  </Text.H6>
                ) : (
                  <span aria-hidden className="block h-4" />
                )}
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}
