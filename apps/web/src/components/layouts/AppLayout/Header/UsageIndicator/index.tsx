'use client'

import { useMemo } from 'react'

import { SubscriptionPlan, FREE_PLANS } from '@latitude-data/core/browser'
import { Button, useSession } from '@latitude-data/web-ui'
import useWorkspaceUsage from '$/stores/workspaceUsage'
import { UsageIndicatorPopover } from '$/components/UsageIndicatorPopover'
import { calcualteUsage } from '$/lib/usageUtils'
import { UpgradeLink } from '$/components/UpgradeLink'

function SubscriptionButton({
  subscriptionPlan,
}: {
  subscriptionPlan: SubscriptionPlan
}) {
  const isFreePlan = FREE_PLANS.includes(subscriptionPlan)
  const label = isFreePlan ? 'Upgrade to Team plan' : 'Contact us to upgrade'
  return (
    <UpgradeLink>
      <Button fancy>{label}</Button>
    </UpgradeLink>
  )
}

export function UsageIndicator() {
  const { data: workspaceUsage, isLoading } = useWorkspaceUsage()
  const { subscriptionPlan, workspace } = useSession()
  const calculatedUsage = useMemo(
    () => calcualteUsage(workspaceUsage),
    [workspaceUsage],
  )

  return (
    <UsageIndicatorPopover
      workspaceUsage={workspaceUsage}
      calculatedUsage={calculatedUsage}
      subscription={subscriptionPlan}
      isLoading={isLoading}
    >
      <SubscriptionButton
        subscriptionPlan={workspace.currentSubscription.plan}
      />
    </UsageIndicatorPopover>
  )
}
