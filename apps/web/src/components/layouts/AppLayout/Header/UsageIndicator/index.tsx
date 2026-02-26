'use client'

import { useSession } from '$/components/Providers/SessionProvider'
import useWorkspaceUsage from '$/stores/workspaceUsage'
import { UsageIndicatorPopover } from '$/components/UsageIndicatorPopover'
import { calculateUsage } from '$/lib/usageUtils'
import { UpgradeLink } from '$/components/UpgradeLink'
import { SubscriptionPlan } from '@latitude-data/core/plans'

export function UsageIndicator() {
  const { subscriptionPlan } = useSession()
  const isEnterprisePlan =
    subscriptionPlan.plan === SubscriptionPlan.EnterpriseV1
  const { data: workspaceUsage, isLoading } = useWorkspaceUsage({
    disable: isEnterprisePlan,
  })

  if (isEnterprisePlan) {
    return null
  }

  const calculatedUsage = calculateUsage(workspaceUsage)

  return (
    <UsageIndicatorPopover
      workspaceUsage={workspaceUsage}
      calculatedUsage={calculatedUsage}
      subscription={subscriptionPlan}
      isLoading={isLoading}
    >
      <UpgradeLink buttonProps={{ fancy: true }} />
    </UsageIndicatorPopover>
  )
}
