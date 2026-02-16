import { Text } from '@latitude-data/web-ui/atoms/Text'
import type { GetUsageOverviewRow } from '@latitude-data/core/services/workspaces/usageOverview/getUsageOverview'

export function UsageCell({
  usageOverview,
}: {
  usageOverview: GetUsageOverviewRow
}) {
  const lastMonth = usageOverview.lastMonthRuns ?? 0
  const prevMonth = usageOverview.lastTwoMonthsRuns ?? 0

  return (
    <div className='flex flex-col gap-1'>
      <Text.H5>{lastMonth.toLocaleString()} traces</Text.H5>
      <Text.H6 color='foregroundMuted'>
        {prevMonth.toLocaleString()} prev month
      </Text.H6>
    </div>
  )
}
