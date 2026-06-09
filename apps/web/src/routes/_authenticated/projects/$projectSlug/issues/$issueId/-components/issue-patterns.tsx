import type { DimensionOutlier } from "@domain/issues"
import type { IssueDimension } from "@domain/scores"
import { Badge, Skeleton, Text, Tooltip } from "@repo/ui"
import { useIssueDimensions } from "../../../../../../../domains/issues/issues.collection.ts"

const DIMENSIONS: {
  readonly id: IssueDimension
  readonly label: string
  readonly noun: string
  readonly empty: string
}[] = [
  { id: "model", label: "Models", noun: "model", empty: "No model data in this issue's traces." },
  { id: "provider", label: "Providers", noun: "provider", empty: "No provider data in this issue's traces." },
  { id: "tool", label: "Tools", noun: "tool", empty: "No tool usage in this issue's traces." },
  { id: "tag", label: "Tags", noun: "tag", empty: "No tags on this issue's traces." },
]

const MAX_ROWS = 5

/** Issue-side share: `<1%` for tiny-but-present so a real value never reads as 0%. */
const formatShare = (fraction: number) => {
  if (fraction <= 0) return "0%"
  if (fraction < 0.01) return "<1%"
  return `${Math.round(fraction * 100)}%`
}

/** Baseline share as a percentage, or `null` when the value never appears elsewhere. */
const formatBaselineShare = (fraction: number): string | null => {
  if (fraction <= 0) return null
  if (fraction < 0.01) return "<1%"
  return `${Math.round(fraction * 100)}%`
}

/** Whole number for big lifts (×386), one decimal for small ones (×2.4). */
const formatLift = (lift: number) => (lift >= 10 ? String(Math.round(lift)) : lift.toFixed(1))

function DimensionRow({
  value,
  percent,
  baselinePercent,
  noun,
  outlier,
}: {
  readonly value: string
  readonly percent: number
  readonly baselinePercent: number
  readonly noun: string
  readonly outlier: DimensionOutlier | undefined
}) {
  const baselineShare = outlier ? formatBaselineShare(outlier.baselinePercent) : null
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-row items-center justify-between gap-2">
        <div className="flex min-w-0 flex-row items-center gap-2">
          <Text.H6 color="foreground" className="truncate">
            {value}
          </Text.H6>
          {outlier ? (
            <Tooltip
              asChild
              trigger={
                <Badge variant="yellow" size="small" shape="rounded">
                  ×{formatLift(outlier.lift)}
                </Badge>
              }
            >
              <div className="flex max-w-[260px] flex-col gap-1">
                <Text.H6>
                  <span className="font-semibold">{value}</span> {noun} appears {formatLift(outlier.lift)}× more often
                  in this issue than across the project.
                </Text.H6>
                <Text.H6 color="foregroundMuted">{formatShare(outlier.issuePercent)} within this issue</Text.H6>
                <Text.H6 color="foregroundMuted">
                  {baselineShare ? `${baselineShare} across the project` : "Not seen elsewhere in the project"}
                </Text.H6>
              </div>
            </Tooltip>
          ) : null}
        </div>
        <Text.H6 color="foregroundMuted" className="shrink-0 tabular-nums">
          {formatShare(percent)}
        </Text.H6>
      </div>
      {/* Issue share fills the bar; the tick marks the project baseline, so the
          gap between them is "how much more this appears here than elsewhere".
          A translucent-white notch stays light in both themes; the position is
          clamped off the rounded edges so a near-zero baseline is still visible. */}
      <div className="relative h-2 w-full overflow-hidden rounded bg-muted">
        <div className="h-full rounded bg-primary" style={{ width: `${Math.min(Math.round(percent * 100), 100)}%` }} />
        {baselinePercent > 0 ? (
          <div
            className="absolute top-0 h-full w-0.5 rounded-full bg-white/70"
            style={{ left: `${Math.min(Math.max(baselinePercent * 100, 1.5), 98)}%` }}
          />
        ) : null}
      </div>
    </div>
  )
}

function DimensionCard({
  projectId,
  issueId,
  dimension,
}: {
  readonly projectId: string
  readonly issueId: string
  readonly dimension: (typeof DIMENSIONS)[number]
}) {
  const { data, isLoading } = useIssueDimensions({ projectId, issueId, dimension: dimension.id })

  const outlierByValue = new Map((data?.outliers ?? []).map((outlier) => [outlier.value, outlier] as const))
  const baselineByValue = new Map((data?.baseline ?? []).map((entry) => [entry.value, entry.percent] as const))
  // Most-anomalous first (outliers by lift), then the rest by share.
  const sorted = [...(data?.issue ?? [])].sort((a, b) => {
    const liftA = outlierByValue.get(a.value)?.lift ?? 0
    const liftB = outlierByValue.get(b.value)?.lift ?? 0
    if (liftA !== liftB) return liftB - liftA
    return b.percent - a.percent
  })
  const rows = sorted.slice(0, MAX_ROWS)
  const remaining = sorted.length - rows.length

  return (
    <div className="flex min-w-[260px] max-w-[360px] flex-1 flex-col gap-3 rounded-lg bg-secondary p-4">
      <Text.H6 color="foregroundMuted">{dimension.label}</Text.H6>
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-7 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Text.H6 color="foregroundMuted">{dimension.empty}</Text.H6>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <DimensionRow
              key={row.value}
              value={row.value}
              percent={row.percent}
              baselinePercent={baselineByValue.get(row.value) ?? 0}
              noun={dimension.noun}
              outlier={outlierByValue.get(row.value)}
            />
          ))}
          {remaining > 0 ? <Text.H6 color="foregroundMuted">+{remaining} more</Text.H6> : null}
        </div>
      )}
    </div>
  )
}

/**
 * Patterns panel: per-dimension (model / provider / tool / tags) value
 * distributions for the issue's occurrences, each compared against the project
 * baseline. Lift badges flag values over-represented vs. baseline; the tooltip
 * spells out the multiplier and the two shares. All dimensions render at once
 * as wrap-able, width-capped cards.
 */
export function IssuePatterns({ projectId, issueId }: { readonly projectId: string; readonly issueId: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Text.H6 color="foregroundMuted">Patterns vs. project baseline</Text.H6>
      {/* Horizontal scroll (not wrap): the four cards stay on one row and scroll
          when the viewport is too narrow, instead of stacking and eating vertical space. */}
      <div className="flex flex-row gap-3 overflow-x-auto pb-1">
        {DIMENSIONS.map((dimension) => (
          <DimensionCard key={dimension.id} projectId={projectId} issueId={issueId} dimension={dimension} />
        ))}
      </div>
    </div>
  )
}
