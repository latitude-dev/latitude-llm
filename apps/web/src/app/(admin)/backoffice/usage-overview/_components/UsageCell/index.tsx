import {
  UsageIndicatorPopover,
  type UsageSubscription,
} from '$/components/UsageIndicatorPopover'
import { calcualteUsage } from '$/lib/usageUtils'
import { computeWorkspaceUsage } from '@latitude-data/core/services/workspaces/usage'
import type { GetUsageOverviewRow } from '@latitude-data/core/services/workspaces/usageOverview/getUsageOverview'
export async function UsageCell({
  usageOverview,
  subscription,
}: {
  usageOverview: GetUsageOverviewRow
  subscription: UsageSubscription
}) {
  if (!usageOverview.subscriptionCreatedAt) {
    throw new Error(
      `Missing subscriptionCreatedAt for workspace ${usageOverview.workspaceId}`,
    )
  }

  const usage = await computeWorkspaceUsage({
    id: usageOverview.workspaceId!,
    currentSubscriptionCreatedAt: new Date(usageOverview.subscriptionCreatedAt),
    plan: usageOverview.subscriptionPlan,
  }).then((r) => r.unwrap())
  const calculatedUsage = calcualteUsage(usage)

  return (
    <UsageIndicatorPopover
      workspaceUsage={usage}
      calculatedUsage={calculatedUsage}
      subscription={subscription}
    />
  )
}
