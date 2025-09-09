'use client'
import { useMemo } from 'react'

import { SubscriptionPlan, FREE_PLANS } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useSession } from '@latitude-data/web-ui/providers'
import useWorkspaceUsage from '$/stores/workspaceUsage'
import { UsageIndicatorPopover } from '$/components/UsageIndicatorPopover'
import { calculateUsage } from '$/lib/usageUtils'
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
    () => calculateUsage(workspaceUsage),
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
