import { Skeleton, Text, Tooltip } from "@repo/ui"
import { Fragment, type ReactNode } from "react"
import type { DurationSegment } from "./duration-composition.ts"
import { SegmentBreakdownRows } from "./segment-breakdown-rows.tsx"
import { formatDuration } from "./tabs/spans-tab/span-tree/tree-utils.ts"

/**
 * The composition bar drawn over a measured "duration line" (end-cap ticks +
 * baseline), distinct from the stacked usage bars so it reads as *time*. Work
 * categories are solid; idle is a hatched gap so the bar communicates "working
 * vs waiting" without a legend. Segments sum to the wall-clock total.
 */
function Tick() {
  return <div className="h-3 w-px shrink-0 bg-border" />
}

function DurationLine({ segments, wallClockMs }: { segments: readonly DurationSegment[]; wallClockMs: number }) {
  return (
    <div className="flex h-3 w-full flex-row items-center">
      <Tick />
      {segments.map((s, i) => (
        <Fragment key={s.category}>
          {i > 0 && <Tick />}
          <div
            className="h-2 min-w-[2px]"
            style={{
              width: `${(s.ms / wallClockMs) * 100}%`,
              ...(s.hollow
                ? {
                    backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 3px, ${s.color} 3px, ${s.color} 4px)`,
                  }
                : { backgroundColor: s.color }),
            }}
          />
        </Fragment>
      ))}
      <Tick />
    </div>
  )
}

export function DurationBar({
  segments,
  wallClockMs,
  badges,
  isLoading = false,
}: {
  readonly segments: readonly DurationSegment[]
  readonly wallClockMs: number
  readonly badges?: ReactNode
  readonly isLoading?: boolean
}) {
  const hasBar = !isLoading && wallClockMs > 0 && segments.length > 0
  const breakdownItems = segments.map((s) => ({ label: s.label, value: s.ms, color: s.color }))

  return (
    <div className="flex min-h-8 flex-row items-center gap-3">
      <div className="flex min-w-12 self-center">
        <Text.H6 color="foregroundMuted" noWrap>
          Duration
        </Text.H6>
      </div>

      {isLoading && (
        <div className="flex min-w-0 w-full max-w-48 self-center items-center">
          <Skeleton className="h-2 w-full" />
        </div>
      )}

      {hasBar && (
        <Tooltip
          asChild
          trigger={
            <div className="flex min-w-0 w-full max-w-48 self-center items-center">
              <DurationLine segments={segments} wallClockMs={wallClockMs} />
            </div>
          }
        >
          <SegmentBreakdownRows segments={breakdownItems} formatValue={formatDuration} />
        </Tooltip>
      )}

      <div className="flex items-center gap-2 self-center">
        <Text.H5 color="foreground" noWrap>
          {wallClockMs > 0 ? formatDuration(wallClockMs) : "-"}
        </Text.H5>
        {badges}
      </div>
    </div>
  )
}
