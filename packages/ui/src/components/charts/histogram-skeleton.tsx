import type { HTMLAttributes } from "react"

import { cn } from "../../utils/cn.ts"
import { Skeleton } from "../skeleton/skeleton.tsx"

const BAR_HEIGHTS = [24, 36, 30, 44, 58, 72, 65, 52, 61, 78, 69, 56, 48, 54, 41, 33] as const
const LABEL_WIDTHS = ["w-10", "w-14", "w-12", "w-16", "w-11"] as const

export type HistogramSkeletonProps = HTMLAttributes<HTMLDivElement> & {
  /** Total height of the skeleton, matching the chart height prop. */
  readonly height?: number
}

export function HistogramSkeleton({ className, height = 160, ...props }: HistogramSkeletonProps) {
  return (
    <div
      {...props}
      className={cn("flex w-full flex-col gap-3", className)}
      style={{ height, ...props.style }}
      aria-busy
    >
      <div className="flex min-h-0 flex-1 items-end gap-1 overflow-hidden border-b border-border/60 pb-1">
        {BAR_HEIGHTS.map((barHeight, index) => (
          <Skeleton
            key={`bar-${index}`}
            className="min-w-0 flex-1 rounded-b-none rounded-t-sm"
            style={{ height: `${barHeight}%` }}
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
