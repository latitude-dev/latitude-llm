import { cn, Text } from "@repo/ui"
import { useState } from "react"
import type { ApdexDimension } from "./agent-score-mock.ts"
import { rankCauses } from "./agent-score-mock.ts"
import { CauseRow } from "./cause-row.tsx"
import { dimensionAnchorId } from "./dimension-anchors.ts"
import { ScoreChip } from "./score-chip.tsx"
import { formatSessions, ROW_HOVER } from "./score-formatters.ts"

const VISIBLE_CAUSES = 4

function BucketBar({ dimension }: { readonly dimension: ApdexDimension }) {
  const buckets = dimension.buckets
  if (!buckets) return null
  const total = buckets.denominator || 1
  const segments = [
    { key: "failed", value: buckets.ruined, className: "bg-rose-600 dark:bg-rose-500" },
    { key: "degraded", value: buckets.degraded, className: "bg-amber-500 dark:bg-amber-400" },
    { key: "clean", value: buckets.clean, className: "bg-green-600 dark:bg-green-500" },
  ].filter((segment) => segment.value > 0)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-2 w-full flex-row overflow-hidden rounded-full">
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={cn("h-full min-w-1", segment.className)}
            style={{ width: `${(segment.value / total) * 100}%` }}
          />
        ))}
      </div>
      <Text.H6 color="foregroundMuted">
        {`${formatSessions(buckets.ruined)} failed · ${formatSessions(buckets.degraded)} degraded · ${formatSessions(buckets.clean)} clean of ${formatSessions(buckets.denominator)} ${buckets.denominatorLabel}`}
      </Text.H6>
    </div>
  )
}

export function DimensionSection({
  dimension,
  projectSlug,
}: {
  readonly dimension: ApdexDimension
  readonly projectSlug: string
}) {
  const [showAll, setShowAll] = useState(false)
  const causes = rankCauses(dimension.causes)
  const visible = showAll ? causes : causes.slice(0, VISIBLE_CAUSES)
  const hidden = causes.slice(VISIBLE_CAUSES)
  const hiddenPoints = hidden.reduce((sum, cause) => sum + (cause.gain ?? 0), 0)
  const largestGain = causes.reduce((largest, cause) => Math.max(largest, cause.gain ?? 0), 0)

  return (
    <div id={dimensionAnchorId(dimension.key)} className="flex scroll-mt-14 flex-col gap-3 rounded-lg bg-secondary p-4">
      <div className="flex min-w-0 flex-row items-center gap-3">
        <ScoreChip size="lg" score={dimension.subScore} {...(dimension.notMeasured ? { label: "n/a" } : {})} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Text.H4M>{dimension.label}</Text.H4M>
          <Text.H6 color="foregroundMuted">{dimension.description}</Text.H6>
        </div>
      </div>
      {dimension.notMeasured ? (
        <div className="flex flex-col gap-1 rounded-md border border-border bg-background p-3">
          <Text.H5M>Not measured</Text.H5M>
          <Text.H6 color="foregroundMuted">{dimension.notMeasured}</Text.H6>
          <Text.H6 color="foregroundMuted">
            Its weight moves to the dimensions we could measure. Nothing scores 100 just because we could not look.
          </Text.H6>
        </div>
      ) : (
        <>
          <BucketBar dimension={dimension} />
          {causes.length === 0 ? (
            <div className="flex min-h-12 items-center">
              <Text.H6 color="foregroundMuted">Nothing found in this window</Text.H6>
            </div>
          ) : (
            <div className="flex flex-col">
              {visible.map((cause) => (
                <CauseRow
                  key={cause.key}
                  cause={cause}
                  projectSlug={projectSlug}
                  dimensionDeficit={dimension.deficit ?? 0}
                  largestGain={largestGain}
                />
              ))}
              {hidden.length === 0 ? null : (
                <button
                  type="button"
                  onClick={() => setShowAll((previous) => !previous)}
                  className={cn(
                    "flex cursor-pointer flex-row items-center gap-2 rounded-md p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    ROW_HOVER,
                  )}
                >
                  <Text.H6 color="primary">
                    {showAll
                      ? "Show less"
                      : hiddenPoints > 0
                        ? `Show ${hidden.length} more, worth ${hiddenPoints.toFixed(1)} points between them`
                        : `Show ${hidden.length} more`}
                  </Text.H6>
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
