'use client'

import type { UsageTrend } from '$/app/(admin)/backoffice/usage-overview/buildUsageInformation'
import { Icon, Tooltip } from '@latitude-data/web-ui'

export function TrendCell({ trend }: { trend: UsageTrend }) {
  const color =
    trend.icon === 'equalApproximately'
      ? 'foregroundMuted'
      : trend.icon === 'arrowUp'
        ? 'success'
        : 'destructive'
  return (
    <Tooltip
      trigger={
        <div className='w-full flex items-center justify-center'>
          <Icon name={trend.icon} size='normal' color={color} />
        </div>
      }
    >
      {trend.twoMonthsAgoRuns <= 0 && trend.last30daysRuns <= 0
        ? 'No runs'
        : `${trend.twoMonthsAgoRuns} runs 2 months ago  / ${trend.last30daysRuns} runs last 30 days`}
    </Tooltip>
  )
}
