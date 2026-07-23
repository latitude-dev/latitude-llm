import { Button, Chart, type ChartSeries, HistogramSkeleton, Icon, Skeleton, Text, Tooltip } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { ChevronDown, ChevronUp, UsersRoundIcon } from "lucide-react"
import { useMemo, useState } from "react"
import type { UsersOverviewRecord } from "../../../../../../domains/end-users/end-users.functions.ts"
import { ChartHeader } from "../../-components/chart-header.tsx"
import { formatBucketLabel } from "./user-formatters.ts"

const OK_SESSIONS_COLOR = "hsl(217 91% 60%)"
const FAILED_SESSIONS_COLOR = "hsl(0 70% 55%)"
const ERROR_RATE_COLOR = "hsl(35 90% 55%)"

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
  rangeFromIso,
  rangeToIso,
  isAllTime,
  onRangeSelect,
}: {
  readonly overview: UsersOverviewRecord | undefined
  readonly isLoading: boolean
  readonly rangeFromIso: string
  readonly rangeToIso: string
  readonly isAllTime: boolean
  readonly onRangeSelect?: ((range: { from: string; to: string } | null) => void) | undefined
}) {
  const [collapsed, setCollapsed] = useState(false)

  const bucketSeconds = overview?.bucketSeconds ?? 24 * 60 * 60
  const bucketWidthMs = bucketSeconds * 1000
  const histogram = overview?.histogram ?? []

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

  const categories = useMemo(
    () => histogram.map((bucket) => formatBucketLabel(bucket.bucket, bucketSeconds)),
    [histogram, bucketSeconds],
  )
  const series = useMemo<readonly ChartSeries[]>(
    () => [
      {
        kind: "bar",
        name: "Errored sessions",
        values: histogram.map((bucket) => bucket.errorSessionCount),
        color: FAILED_SESSIONS_COLOR,
        axis: "left",
        stack: "sessions",
      },
      {
        kind: "bar",
        name: "Successful sessions",
        values: histogram.map((bucket) => bucket.sessionCount - bucket.errorSessionCount),
        color: OK_SESSIONS_COLOR,
        axis: "left",
        stack: "sessions",
      },
      {
        kind: "line",
        name: "Error rate %",
        values: histogram.map((bucket) =>
          bucket.sessionCount > 0 ? Math.round((bucket.errorSessionCount / bucket.sessionCount) * 1000) / 10 : 0,
        ),
        color: ERROR_RATE_COLOR,
        axis: "right",
        smooth: true,
      },
    ],
    [histogram],
  )

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
                label="Identified sessions"
                value={formatCoverage(overview?.identifiedSessions ?? 0, overview?.totalSessions ?? 0)}
                isLoading={showSkeletons}
                tooltip="Share of sessions in this time window that carry a user id, and can therefore be attributed to a user."
              />
              <AggregationItem
                label="Sessions per user"
                value={
                  overview && overview.uniqueUsers > 0
                    ? formatCount(Math.round(overview.identifiedSessions / overview.uniqueUsers))
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
        ) : histogram.length === 0 || histogram.every((bucket) => bucket.sessionCount === 0) ? (
          <div className="flex w-full min-h-[80px] items-center justify-center px-4 py-3">
            <Text.H6 color="foregroundMuted">No user sessions in this time window</Text.H6>
          </div>
        ) : (
          <>
            <ChartHeader
              title="User sessions over time"
              fromIso={rangeFromIso}
              toIso={rangeToIso}
              isAllTime={isAllTime}
            />
            <div className="px-4 py-3">
              <Chart
                categories={categories}
                series={series}
                height={160}
                xAxisLabelFontSize={10}
                ariaLabel="User sessions over time"
                {...(onRangeSelect ? { onSelect: handleSelect } : {})}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
