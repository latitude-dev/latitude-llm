import { Skeleton } from "@repo/ui"

const BAR_HEIGHTS = [24, 36, 30, 44, 58, 72, 65, 52, 61, 78, 69, 56, 48, 54, 41, 33] as const
const LABEL_WIDTHS = ["w-10", "w-14", "w-12", "w-16", "w-11"] as const

export function AnalyticsHistogramSkeleton() {
  return (
    <div className="flex w-full flex-col gap-3" aria-busy>
      <div className="flex h-[160px] items-end gap-1 overflow-hidden border-b border-border/60 pb-1">
        {BAR_HEIGHTS.map((height, index) => (
          <Skeleton
            key={`bar-${index}`}
            className="min-w-0 flex-1 rounded-b-none rounded-t-sm"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        {LABEL_WIDTHS.map((width, index) => (
          <Skeleton key={`label-${index}`} className={`h-3 ${width}`} />
        ))}
      </div>
    </div>
  )
}
