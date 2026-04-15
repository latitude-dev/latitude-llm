import { BarChart, HistogramSkeleton, Skeleton, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { useCallback } from "react"
import type { IssuesListResultRecord } from "../../../../../../domains/issues/issues.functions.ts"
import { formatDayBucketLabel, formatDayBucketTooltipLabel } from "./issue-formatters.ts"

const COUNT_CARDS = [
  { key: "newIssues", label: "New issues" },
  { key: "escalatingIssues", label: "Escalating issues" },
  { key: "regressedIssues", label: "Regressed issues" },
  { key: "resolvedIssues", label: "Resolved issues" },
  { key: "seenOccurrences", label: "Seen occurrences" },
] as const
const ISSUE_HISTOGRAM_BUCKET_MS = 24 * 60 * 60 * 1000

function AggregationItem({
  label,
  value,
  isLoading,
  skeletonWidthClassName = "w-16",
}: {
  readonly label: string
  readonly value: string
  readonly isLoading?: boolean
  readonly skeletonWidthClassName?: string
}) {
  return (
    <div className="flex basis-[176px] min-w-[176px] shrink-0 flex-col gap-2">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      {isLoading ? (
        <Skeleton className={`h-5 ${skeletonWidthClassName}`} />
      ) : (
        <Text.H5 color="foreground" className="tabular-nums">
          {value}
        </Text.H5>
      )}
    </div>
  )
}

export function IssuesAnalyticsPanel({
  analytics,
  isLoading,
  onRangeSelect,
  showMetricsRow = true,
  withPanelChrome = true,
}: {
  readonly analytics: IssuesListResultRecord["analytics"]
  readonly isLoading: boolean
  readonly onRangeSelect?: ((range: { from: string; to: string } | null) => void) | undefined
  /** When false, only the occurrence histogram is shown (e.g. project home). */
  readonly showMetricsRow?: boolean
  /** When false, omit outer `rounded-lg bg-secondary` wrapper — parent supplies chrome. */
  readonly withPanelChrome?: boolean
}) {
  const handleSelect = useCallback(
    (range: { startIndex: number; endIndex: number } | null) => {
      if (!onRangeSelect) return

      if (!range) {
        onRangeSelect(null)
        return
      }

      const startBucket = analytics.histogram[range.startIndex]
      const endBucket = analytics.histogram[range.endIndex]
      if (!startBucket || !endBucket) return

      const from = `${startBucket.bucket}T00:00:00.000Z`
      const to = new Date(Date.parse(`${endBucket.bucket}T00:00:00.000Z`) + ISSUE_HISTOGRAM_BUCKET_MS - 1).toISOString()

      onRangeSelect({ from, to })
    },
    [analytics.histogram, onRangeSelect],
  )

  const chartBlock = isLoading ? (
    <div className="px-2 py-2">
      <HistogramSkeleton height={160} />
    </div>
  ) : analytics.histogram.length === 0 || analytics.histogram.every((bucket) => bucket.count === 0) ? (
    <div className="flex min-h-[80px] w-full items-center justify-center px-2 py-2">
      <Text.H6 color="foregroundMuted">No issue occurrences in this time window</Text.H6>
    </div>
  ) : (
    <div className="px-2 py-2">
      <BarChart
        data={analytics.histogram.map((bucket) => ({
          category: formatDayBucketLabel(bucket.bucket).replaceAll(" ", "\u00A0"),
          tooltipCategory: formatDayBucketTooltipLabel(bucket.bucket),
          value: bucket.count,
        }))}
        height={160}
        showYAxis={false}
        xAxisLabelFontSize={10}
        ariaLabel="Issue occurrences by day"
        formatTooltip={(category, value) => `${category}<br/><b>${formatCount(value)}</b> occurrences`}
        onSelect={onRangeSelect ? handleSelect : undefined}
      />
    </div>
  )

  if (!withPanelChrome) {
    return (
      <div className="flex flex-col">
        {showMetricsRow ? (
          <div className="flex flex-row flex-wrap gap-3 p-4">
            {COUNT_CARDS.map((card) => (
              <AggregationItem
                key={card.key}
                label={card.label}
                value={formatCount(analytics.counts[card.key])}
                isLoading={isLoading}
                skeletonWidthClassName={card.key === "seenOccurrences" ? "w-20" : "w-16"}
              />
            ))}
          </div>
        ) : null}
        {chartBlock}
      </div>
    )
  }

  return (
    <div className="flex flex-col rounded-lg bg-secondary p-2">
      {showMetricsRow ? (
        <div className="flex flex-row flex-wrap gap-3 p-4">
          {COUNT_CARDS.map((card) => (
            <AggregationItem
              key={card.key}
              label={card.label}
              value={formatCount(analytics.counts[card.key])}
              isLoading={isLoading}
              skeletonWidthClassName={card.key === "seenOccurrences" ? "w-20" : "w-16"}
            />
          ))}
        </div>
      ) : null}

      {chartBlock}
    </div>
  )
}
