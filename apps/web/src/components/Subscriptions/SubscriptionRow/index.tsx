'use client'

import { useState } from 'react'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { assignStripeCustomerIdAction } from '$/actions/admin/workspaces/assignStripeCustomerId'
import { updateSubscriptionCancelledAtAction } from '$/actions/admin/subscriptions/updateCancelledAt'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useRouter } from 'next/navigation'
import { FREE_PLANS, SubscriptionPlan } from '@latitude-data/core/plans'
import Link from 'next/link'
import { ROUTES } from '$/services/routes'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'

type SubscriptionData = {
  id: number
  plan: SubscriptionPlan
  trialEndsAt: Date | null
  cancelledAt: Date | null
  billableFrom: Date
  billableAt: Date
}

type Props = {
  workspaceId: number
  workspaceName: string
  stripeCustomerId: string | null
  subscription: SubscriptionData
}

function formatDateForInput(date: Date | null): string {
  if (!date) return ''
  const d = new Date(date)
  return d.toISOString().split('T')[0]!
}

function formatPlanName(plan: string): string {
  return plan
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function SubscriptionRow({
  workspaceId,
  workspaceName,
  stripeCustomerId: initialStripeCustomerId,
  subscription,
}: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const [stripeCustomerId, setStripeCustomerId] = useState(
    initialStripeCustomerId ?? '',
  )
  const [cancelledAt, setCancelledAt] = useState(
    formatDateForInput(subscription.cancelledAt),
  )

  const isFreePlan = FREE_PLANS.includes(subscription.plan)
  const hasTrialDate =
    subscription.trialEndsAt && new Date(subscription.trialEndsAt) > new Date()
  const hasInvalidTrial = !isFreePlan && hasTrialDate
  const isCancelled = subscription.cancelledAt !== null

  const { execute: executeStripeUpdate, isPending: isStripeUpdating } =
    useLatitudeAction(assignStripeCustomerIdAction, {
      onSuccess: () => {
        toast({
          title: 'Success',
          description: 'Stripe Customer ID updated',
        })
        router.refresh()
      },
      onError: (err) => {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: err.message,
        })
      },
    })

  const { execute: executeCancelUpdate, isPending: isCancelUpdating } =
    useLatitudeAction(updateSubscriptionCancelledAtAction, {
      onSuccess: () => {
        toast({
          title: 'Success',
          description: 'Cancellation date updated',
        })
        router.refresh()
      },
      onError: (err) => {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: err.message,
        })
      },
    })

  const handleStripeSave = () => {
    executeStripeUpdate({
      workspaceId,
      stripeCustomerId: stripeCustomerId.trim(),
    })
  }

  const handleCancelSave = () => {
    executeCancelUpdate({
      workspaceId,
      cancelledAt: cancelledAt || null,
    })
  }

  const stripeHasChanged = stripeCustomerId !== (initialStripeCustomerId ?? '')
  const cancelHasChanged =
    cancelledAt !== formatDateForInput(subscription.cancelledAt)

  const hasMissingCustomerId = !initialStripeCustomerId

  return (
    <div
      className={`grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 border rounded-lg bg-card items-center ${hasMissingCustomerId ? 'border-destructive' : ''}`}
    >
      <div className='flex flex-col gap-2'>
        <div className='flex flex-col'>
          <Text.H5 weight='medium'>{workspaceName}</Text.H5>
          <Link href={ROUTES.backoffice.search.workspace(workspaceId)}>
            <Text.H6 underline color='primary'>
              View Workspace #{workspaceId}
            </Text.H6>
          </Link>
        </div>
        <div className='flex items-center gap-2 flex-wrap'>
          <Badge variant='success' size='small'>
            {formatPlanName(subscription.plan)}
          </Badge>
          {hasInvalidTrial && (
            <Badge variant='destructive' size='small'>
              Trial
            </Badge>
          )}
          {isCancelled && (
            <Badge variant='warningMuted' size='small'>
              Cancelling
            </Badge>
          )}
          <ClientOnly loader={<Text.H6 color='foregroundMuted'>Loading...</Text.H6>}>
            <Text.H6 color='foregroundMuted'>
              Billing Period:{' '}
              {new Date(subscription.billableFrom).toLocaleDateString()} -{' '}
              {new Date(subscription.billableAt).toLocaleDateString()}
            </Text.H6>
          </ClientOnly>
        </div>
      </div>

      <div className='flex gap-2 items-end'>
        <Input
          label='Stripe Customer ID'
          size='small'
          value={stripeCustomerId}
          onChange={(e) => setStripeCustomerId(e.target.value)}
          placeholder='cus_xxx'
          disabled={isStripeUpdating}
          className='flex-1'
        />
        <Button
          variant='outline'
          size='small'
          onClick={handleStripeSave}
          disabled={isStripeUpdating || !stripeHasChanged}
        >
          {isStripeUpdating ? '...' : 'Save'}
        </Button>
      </div>

      <div className='flex gap-2 items-end'>
        <Input
          label='Cancel at'
          size='small'
          type='date'
          value={cancelledAt}
          onChange={(e) => setCancelledAt(e.target.value)}
          disabled={isCancelUpdating}
          className='flex-1'
        />
        <Button
          variant={cancelledAt ? 'outlineDestructive' : 'outline'}
          size='small'
          onClick={handleCancelSave}
          disabled={isCancelUpdating || !cancelHasChanged}
        >
          {isCancelUpdating ? '...' : cancelledAt ? 'Set' : 'Clear'}
        </Button>
      </div>
    </div>
  )
}
