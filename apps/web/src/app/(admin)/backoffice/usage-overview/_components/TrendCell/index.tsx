'use client'
import type { UsageTrend } from '$/app/(admin)/backoffice/usage-overview/buildUsageInformation'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'

export function TrendCell({ trend }: { trend: UsageTrend }) {
  const color =
    trend.icon === 'equalApproximately'
      ? 'foregroundMuted'
      : trend.icon === 'arrowUp'
        ? 'success'
        : 'destructive'
  return (
    <div className='w-full flex items-center justify-start gap-x-3'>
      <Tooltip
        trigger={
          <div className='w-full flex items-center justify-center'>
            <Icon name={trend.icon} size='normal' color={color} />
          </div>
        }
      >
        {trend.twoMonthsAgoTraces <= 0 && trend.last30daysTraces <= 0
          ? 'No traces'
          : `${trend.twoMonthsAgoTraces} traces 2 months ago  / ${trend.last30daysTraces} traces last 30 days`}
      </Tooltip>
      <Text.H6>{trend.last30daysTraces}</Text.H6>
    </div>
  )
}
