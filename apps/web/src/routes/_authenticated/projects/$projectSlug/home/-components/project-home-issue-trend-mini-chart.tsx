import { BarChart, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { useMemo } from "react"
import type { IssueRecord } from "../../../../../../domains/issues/issues.functions.ts"
import { formatDayBucketTooltipLabel } from "../../issues/-components/issue-formatters.ts"

export function ProjectHomeIssueTrendMiniChart({ issue }: { readonly issue: IssueRecord }) {
  const data = useMemo(
    () =>
      issue.trend.map((bucket) => ({
        category: bucket.bucket,
        tooltipCategory: formatDayBucketTooltipLabel(bucket.bucket),
        value: bucket.count,
      })),
    [issue.trend],
  )

  if (data.length === 0) {
    return (
      <div className="flex h-8 w-[112px] shrink-0 items-center justify-center rounded-sm border border-dashed border-border/60 bg-background/50">
        <Text.H7 color="foregroundMuted">—</Text.H7>
      </div>
    )
  }

  return (
    <div className="h-8 w-[112px] shrink-0 overflow-hidden rounded-sm">
      <BarChart
        data={data}
        height={32}
        showYAxis={false}
        showXAxisLabels={false}
        ariaLabel={`Occurrences over time for ${issue.name}`}
        formatTooltip={(category, value) => `${category}<br/><b>${formatCount(value)}</b> occurrences`}
      />
    </div>
  )
}
