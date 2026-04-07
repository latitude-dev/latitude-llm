import type { HTMLAttributes } from "react"

import { cn } from "../../utils/cn.ts"
import { Skeleton } from "../skeleton/skeleton.tsx"

export type ChartSkeletonProps = HTMLAttributes<HTMLElement> & {
  /** Minimum height of the placeholder (default 200). */
  readonly minHeight?: number
}

/**
 * Loading placeholder for chart regions; mimics a simple bar silhouette.
 */
function ChartSkeleton({ className, minHeight = 200, ...props }: ChartSkeletonProps) {
  /** Integer flex-grow weights (same proportions as the old % widths); `basis-0` + grow fills row after `gap` without overflow. */
  const bars = [
    { key: "a", flexGrow: 6, heightPct: 42 },
    { key: "b", flexGrow: 10, heightPct: 68 },
    { key: "c", flexGrow: 8, heightPct: 55 },
    { key: "d", flexGrow: 12, heightPct: 78 },
    { key: "e", flexGrow: 7, heightPct: 48 },
    { key: "f", flexGrow: 9, heightPct: 62 },
    { key: "g", flexGrow: 11, heightPct: 71 },
  ] as const
  return (
    <section
      {...props}
      className={cn("flex w-full flex-col gap-3 rounded-lg border border-border/60 bg-secondary/30 p-4", className)}
      style={{ minHeight, ...props.style }}
      aria-busy
      aria-label="Loading chart"
    >
      <Skeleton className="h-3 w-32" />
      <div className="flex min-h-0 flex-1 items-end gap-1 pt-4">
        {bars.map((bar) => (
          <Skeleton
            key={bar.key}
            className="min-w-0 shrink basis-0 rounded-t-sm"
            style={{ flex: `${bar.flexGrow} 1 0%`, height: `${bar.heightPct}%` }}
          />
        ))}
      </div>
    </section>
  )
}

export { ChartSkeleton }
