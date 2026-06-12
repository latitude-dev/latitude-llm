import { BarChart, Button, HistogramSkeleton, Icon, Skeleton, Text, Tooltip } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { ChevronDown, ChevronUp, UsersRoundIcon } from "lucide-react"
import { useState } from "react"
import type { UsersOverviewRecord } from "../../../../../../domains/end-users/end-users.functions.ts"
import { formatBucketLabel, formatBucketTooltipLabel } from "./user-formatters.ts"

function AggregationItem({
  label,
  value,
  isLoading,
  tooltip,
}: {
  readonly label: string
  readonly value: string
  readonly isLoading?: boolean
  readonly tooltip?: string
}) {
  const labelText = <Text.H6 color="foregroundMuted">{label}</Text.H6>
  return (
    <div className="flex basis-[176px] min-w-[176px] shrink-0 flex-col gap-2">
      {tooltip ? (
        <Tooltip asChild trigger={<span className="w-max cursor-default">{labelText}</span>}>
          {tooltip}
        </Tooltip>
      ) : (
        labelText
      )}
      {isLoading ? (
        <Skeleton className="h-5 w-16" />
      ) : (
        <Text.H5 color="foreground" className="tabular-nums">
          {value}
        </Text.H5>
      )}
    </div>
  )
}

function formatCoverage(identified: number, total: number): string {
  if (total === 0) return "-"
  const percent = (identified / total) * 100
  return percent >= 10 ? `${Math.round(percent)}%` : `${percent.toFixed(1).replace(/\.0$/, "")}%`
}

export function UsersAnalyticsPanel({
  overview,
  isLoading,
  onRangeSelect,
}: {
  readonly overview: UsersOverviewRecord | undefined
  readonly isLoading: boolean
  readonly onRangeSelect?: ((range: { from: string; to: string } | null) => void) | undefined
}) {
  const [collapsed, setCollapsed] = useState(false)

  const bucketSeconds = overview?.bucketSeconds ?? 24 * 60 * 60
  const bucketWidthMs = bucketSeconds * 1000
  const histogram = overview?.histogram ?? []
  const chartData = histogram.map((bucket) => ({
    category: formatBucketLabel(bucket.bucket, bucketSeconds),
    tooltipCategory: formatBucketTooltipLabel(bucket.bucket, bucketSeconds),
    value: bucket.activeUsers,
  }))

  const handleSelect = (range: { startIndex: number; endIndex: number } | null) => {
    if (!onRangeSelect) return
    if (!range) {
      onRangeSelect(null)
      return
    }
    const startBucket = histogram[range.startIndex]
    const endBucket = histogram[range.endIndex]
    if (!startBucket || !endBucket) return
    onRangeSelect({
      from: new Date(Date.parse(startBucket.bucket)).toISOString(),
      to: new Date(Date.parse(endBucket.bucket) + bucketWidthMs - 1).toISOString(),
    })
  }

  if (collapsed) {
    return (
      <div className="flex flex-col rounded-lg bg-secondary">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-1.5">
            <Icon icon={UsersRoundIcon} size="sm" color="foregroundMuted" />
            <Text.H6 color="foregroundMuted">Users statistics</Text.H6>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)} aria-label="Expand statistics">
            <Icon icon={ChevronDown} size="sm" />
          </Button>
        </div>
      </div>
    )
  }

  const showSkeletons = isLoading || !overview

  return (
    <div className="flex flex-col rounded-lg bg-secondary">
      <div className="p-2">
        <div className="flex items-start gap-1 pr-2">
          <div className="relative min-w-0 flex-1">
            <div className="flex flex-row gap-3 overflow-x-auto p-4">
              <AggregationItem
                label="Unique users"
                value={formatCount(overview?.uniqueUsers ?? 0)}
                isLoading={showSkeletons}
              />
              <AggregationItem
                label="New users"
                value={formatCount(overview?.newUsers ?? 0)}
                isLoading={showSkeletons}
              />
              <AggregationItem
                label="Identified traces"
                value={formatCoverage(overview?.identifiedTraces ?? 0, overview?.totalTraces ?? 0)}
                isLoading={showSkeletons}
                tooltip="Share of traces in this time window that carry a user id property, and can therefore be attributed to a user."
              />
              <AggregationItem
                label="Traces per user"
                value={
                  overview && overview.uniqueUsers > 0
                    ? formatCount(Math.round(overview.identifiedTraces / overview.uniqueUsers))
                    : "-"
                }
                isLoading={showSkeletons}
              />
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-secondary to-transparent" />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse statistics"
            className="shrink-0"
          >
            <Icon icon={ChevronUp} size="sm" />
          </Button>
        </div>

        {showSkeletons ? (
          <div className="px-4 py-3">
            <HistogramSkeleton height={160} />
          </div>
        ) : histogram.length === 0 || histogram.every((bucket) => bucket.activeUsers === 0) ? (
          <div className="flex w-full min-h-[80px] items-center justify-center px-4 py-3">
            <Text.H6 color="foregroundMuted">No identified users in this time window</Text.H6>
          </div>
        ) : (
          <div className="px-4 py-3">
            <BarChart
              data={chartData}
              height={160}
              showYAxis={false}
              xAxisLabelFontSize={10}
              ariaLabel="Active users over time"
              formatTooltip={(category, value) => `${category}<br/><b>${formatCount(value)}</b> active users`}
              onSelect={onRangeSelect ? handleSelect : undefined}
            />
          </div>
        )}
      </div>
    </div>
  )
}
