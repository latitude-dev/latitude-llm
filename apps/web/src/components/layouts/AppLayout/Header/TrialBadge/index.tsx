'use client'

import { useMemo } from 'react'

import { useSession } from '$/components/Providers/SessionProvider'
import { UpgradeLink } from '$/components/UpgradeLink'
import { Badge, BadgeProps } from '@latitude-data/web-ui/atoms/Badge'
import { Popover } from '@latitude-data/web-ui/atoms/Popover'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { FREE_PLANS, TrialInfo } from '@latitude-data/core/plans'

const ALARM_THRESHOLD_DAYS = 10

function formatTrialEndDate(date: Date | null): string {
  if (!date) return 'N/A'
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

type TrialContent = {
  badgeVariant: BadgeProps['variant']
  badgeText: string
  title: string
  description: string
}

function getTrialContent({
  trialInfo,
  isFreePlan,
}: {
  trialInfo: TrialInfo | null
  isFreePlan: boolean
}): TrialContent | null {
  if (!isFreePlan || !trialInfo) return null

  const { trialEnded, trialDaysLeft, trialEndsAt } = trialInfo

  if (trialEnded) {
    return {
      badgeVariant: 'destructive',
      badgeText: 'Trial ended',
      title: 'Trial Ended',
      description:
        'Your free trial has ended. Upgrade now to continue using all features without interruption.',
    }
  }

  const isAlarm = trialDaysLeft <= ALARM_THRESHOLD_DAYS
  const daysLabel = trialDaysLeft === 1 ? 'day' : 'days'

  return {
    badgeVariant: isAlarm ? 'warningMuted' : 'accent',
    badgeText: `${trialDaysLeft} ${daysLabel} left in trial`,
    title: 'Free Trial',
    description: `Your free trial ends on ${formatTrialEndDate(trialEndsAt)}. Upgrade now to keep access to all features and avoid any interruption.`,
  }
}

export function TrialBadge() {
  const { subscriptionPlan } = useSession()
  const trialInfo = subscriptionPlan.trialInfo
  const isFreePlan = FREE_PLANS.includes(subscriptionPlan.plan)

  const content = useMemo(
    () => getTrialContent({ trialInfo, isFreePlan }),
    [trialInfo, isFreePlan],
  )

  if (!content) return null

  const { badgeVariant, badgeText, title, description } = content

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className='cursor-pointer'>
          <Badge size='large' variant={badgeVariant}>
            {badgeText}
          </Badge>
        </button>
      </Popover.Trigger>
      <Popover.Content side='bottom' align='end' size='medium'>
        <div className='flex flex-col gap-y-3'>
          <div className='flex flex-col gap-y-1'>
            <Text.H5M color='foreground'>{title}</Text.H5M>
            <Text.H6 color='foregroundMuted'>{description}</Text.H6>
          </div>
          <div className='flex flex-row'>
            <UpgradeLink buttonProps={{ fancy: true }} />
          </div>
        </div>
      </Popover.Content>
    </Popover.Root>
  )
}
