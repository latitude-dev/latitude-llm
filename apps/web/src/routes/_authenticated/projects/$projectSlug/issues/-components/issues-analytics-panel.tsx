import { BarChart, ChartSkeleton, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import type { IssuesListResultRecord } from "../../../../../../domains/issues/issues.functions.ts"
import { formatDayBucketLabel, formatDayBucketTooltipLabel } from "./issue-formatters.ts"

const COUNT_CARDS = [
  { key: "newIssues", label: "New issues" },
  { key: "escalatingIssues", label: "Escalating issues" },
  { key: "regressedIssues", label: "Regressed issues" },
  { key: "resolvedIssues", label: "Resolved issues" },
  { key: "seenOccurrences", label: "Seen occurrences" },
] as const

function AggregationItem({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex basis-[176px] min-w-[176px] shrink-0 flex-col gap-2">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      <Text.H5 color="foreground" className="tabular-nums">
        {value}
      </Text.H5>
    </div>
  )
}

export function IssuesAnalyticsPanel({
  analytics,
  isLoading,
}: {
  readonly analytics: IssuesListResultRecord["analytics"]
  readonly isLoading: boolean
}) {
  return (
    <div className="flex flex-col rounded-lg bg-secondary p-2">
      <div className="flex flex-row flex-wrap gap-3 p-4">
        {COUNT_CARDS.map((card) => (
          <AggregationItem
            key={card.key}
            label={card.label}
            value={isLoading ? "..." : formatCount(analytics.counts[card.key])}
          />
        ))}
      </div>

      {isLoading ? (
        <div className="px-4 py-3">
          <ChartSkeleton minHeight={160} className="border-0 bg-transparent p-0" />
        </div>
      ) : analytics.histogram.length === 0 || analytics.histogram.every((bucket) => bucket.count === 0) ? (
        <div className="flex w-full min-h-[80px] items-center justify-center px-4 py-3">
          <Text.H6 color="foregroundMuted">No issue occurrences in this time window</Text.H6>
        </div>
      ) : (
        <div className="px-4 py-3">
          <BarChart
            data={analytics.histogram.map((bucket) => ({
              category: formatDayBucketLabel(bucket.bucket),
              tooltipCategory: formatDayBucketTooltipLabel(bucket.bucket),
              value: bucket.count,
            }))}
            height={160}
            showYAxis={false}
            ariaLabel="Issue occurrences by day"
            formatTooltip={(category, value) => `${category}<br/><b>${formatCount(value)}</b> occurrences`}
          />
        </div>
      )}
    </div>
  )
}
