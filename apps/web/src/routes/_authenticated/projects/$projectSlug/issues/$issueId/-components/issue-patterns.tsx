import { type DimensionOutlier, ISSUE_DIMENSION_MIN_SAMPLE } from "@domain/issues"
import type { IssueDimension } from "@domain/scores"
import { Badge, Skeleton, Tabs, Text, Tooltip } from "@repo/ui"
import { useState } from "react"
import { useIssueDimensions } from "../../../../../../../domains/issues/issues.collection.ts"

const DIMENSION_TABS: { readonly id: IssueDimension; readonly label: string }[] = [
  { id: "model", label: "Model" },
  { id: "provider", label: "Provider" },
  { id: "tool", label: "Tool" },
  { id: "tag", label: "Tags" },
]

const MAX_ROWS = 8

const formatPercent = (fraction: number) => `${Math.round(fraction * 100)}%`

function DimensionRow({
  value,
  percent,
  outlier,
}: {
  readonly value: string
  readonly percent: number
  readonly outlier: DimensionOutlier | undefined
}) {
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
                  ×{outlier.lift.toFixed(1)}
                </Badge>
              }
            >
              {formatPercent(outlier.issuePercent)} in this issue vs {formatPercent(outlier.baselinePercent)} across the
              project
            </Tooltip>
          ) : null}
        </div>
        <Text.H6 color="foregroundMuted" className="shrink-0 tabular-nums">
          {formatPercent(percent)}
        </Text.H6>
      </div>
      <div className="h-2 w-full overflow-hidden rounded bg-muted">
        {/* Width is data-driven, so it must be an inline style. */}
        <div className="h-full rounded bg-primary" style={{ width: `${Math.round(percent * 100)}%` }} />
      </div>
    </div>
  )
}

/**
 * Patterns panel: how the issue's occurrences are distributed across a
 * telemetry dimension (model / provider / tool / tags) and which values are
 * over-represented vs. the project baseline (lift badges). Low-sample issues
 * show a "not enough data" state instead of misleading shares.
 */
export function IssuePatterns({ projectId, issueId }: { readonly projectId: string; readonly issueId: string }) {
  const [dimension, setDimension] = useState<IssueDimension>("model")
  const { data, isLoading } = useIssueDimensions({ projectId, issueId, dimension })

  const outlierByValue = new Map((data?.outliers ?? []).map((outlier) => [outlier.value, outlier] as const))
  // Most-anomalous first (outliers by lift), then the remaining values by share.
  const rows = [...(data?.issue ?? [])]
    .sort((a, b) => {
      const liftA = outlierByValue.get(a.value)?.lift ?? 0
      const liftB = outlierByValue.get(b.value)?.lift ?? 0
      if (liftA !== liftB) return liftB - liftA
      return b.percent - a.percent
    })
    .slice(0, MAX_ROWS)

  const hasEnoughData = data !== undefined && data.sampleSize >= ISSUE_DIMENSION_MIN_SAMPLE && rows.length > 0

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-secondary p-4">
      <div className="flex flex-row items-center justify-between gap-2">
        <Text.H6 color="foregroundMuted">Patterns vs. project baseline</Text.H6>
        <Tabs
          variant="bordered"
          size="sm"
          options={DIMENSION_TABS}
          active={dimension}
          onSelect={(value) => setDimension(value)}
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-7 w-full" />
          ))}
        </div>
      ) : hasEnoughData ? (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <DimensionRow
              key={row.value}
              value={row.value}
              percent={row.percent}
              outlier={outlierByValue.get(row.value)}
            />
          ))}
        </div>
      ) : (
        <Text.H6 color="foregroundMuted">
          Not enough occurrences yet to compare this issue against the project baseline.
        </Text.H6>
      )}
    </div>
  )
}
