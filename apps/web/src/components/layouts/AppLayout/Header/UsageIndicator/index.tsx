'use client'

import { useMemo } from 'react'

import { SubscriptionPlan, FREE_PLANS } from '@latitude-data/core/browser'
import { Button, SessionUser, useSession } from '@latitude-data/web-ui'
import useWorkspaceUsage from '$/stores/workspaceUsage'
import Link from 'next/link'
import { UsageIndicatorPopover } from '$/components/UsageIndicatorPopover'
import { calcualteUsage } from '$/lib/usageUtils'

function SubscriptionButton({
  paymentUrl,
  currentUser,
  subscriptionPlan,
}: {
  paymentUrl: string
  currentUser: SessionUser
  subscriptionPlan: SubscriptionPlan
}) {
  const upgradeLink = `${paymentUrl}?prefilled_email=${currentUser.email}`
  const isFreePlan = FREE_PLANS.includes(subscriptionPlan)
  const href = isFreePlan ? upgradeLink : 'mailto:hello@latitude.so'
  const label = isFreePlan ? 'Upgrade to Team plan' : 'Contact us to upgrade'
  return (
    <Link href={href} target='_blank'>
      <Button fancy>{label}</Button>
    </Link>
  )
}

export function UsageIndicator({ paymentUrl }: { paymentUrl: string }) {
  const { data: workspaceUsage, isLoading } = useWorkspaceUsage()
  const { currentUser, subscriptionPlan, workspace } = useSession()
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
        currentUser={currentUser}
        paymentUrl={paymentUrl}
      />
    </UsageIndicatorPopover>
  )
}
