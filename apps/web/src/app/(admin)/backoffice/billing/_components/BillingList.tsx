'use client'

import { PayingWorkspace } from '$/data-access'
import { SubscriptionRow } from '$/components/Subscriptions/SubscriptionRow'
import { Text } from '@latitude-data/web-ui/atoms/Text'

type Props = {
  workspaces: PayingWorkspace[]
}

export function BillingList({ workspaces }: Props) {
  if (workspaces.length === 0) {
    return (
      <div className='p-6 border rounded-lg bg-card'>
        <Text.H5 color='foregroundMuted'>
          No workspaces with paying plans found.
        </Text.H5>
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-4'>
      {workspaces.map((workspace) => (
        <SubscriptionRow
          key={workspace.id}
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          stripeCustomerId={workspace.stripeCustomerId}
          subscription={workspace.subscription}
        />
      ))}
    </div>
  )
}
