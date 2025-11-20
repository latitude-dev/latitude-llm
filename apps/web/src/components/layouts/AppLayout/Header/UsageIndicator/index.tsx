'use client'
import { useMemo } from 'react'

import { useSession } from '$/components/Providers/SessionProvider'
import useWorkspaceUsage from '$/stores/workspaceUsage'
import { UsageIndicatorPopover } from '$/components/UsageIndicatorPopover'
import { calculateUsage } from '$/lib/usageUtils'
import { UpgradeLink } from '$/components/UpgradeLink'

export function UsageIndicator() {
  const { data: workspaceUsage, isLoading } = useWorkspaceUsage()
  const { subscriptionPlan } = useSession()
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
      <UpgradeLink buttonProps={{ fancy: true }} />
    </UsageIndicatorPopover>
  )
}
