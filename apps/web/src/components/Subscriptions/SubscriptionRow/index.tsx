'use client'

import { useState } from 'react'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { assignStripeCustomerIdAction } from '$/actions/admin/workspaces/assignStripeCustomerId'
import { updateSubscriptionCancelledAtAction } from '$/actions/admin/subscriptions/updateCancelledAt'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useRouter } from 'next/navigation'
import { FREE_PLANS, SubscriptionPlan } from '@latitude-data/core/plans'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import Link from 'next/link'
import { ROUTES } from '$/services/routes'

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
  workspaceName?: string
  stripeCustomerId: string | null
  subscription: SubscriptionData
  showWorkspaceInfo?: boolean
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

function StripeId({
  stripeCustomerId: stripeCustomerId,
  subscription,
}: {
  stripeCustomerId: string | null
  subscription: SubscriptionData
}) {
  const isFreePlan = FREE_PLANS.includes(subscription.plan)

  if (!isFreePlan && !stripeCustomerId) {
    return (
      <div className='flex flex-row items-center gap-1'>
        <Icon name='alert' color='destructive' />
        <Text.H6 color='destructive'>Missing Stripe ID</Text.H6>
      </div>
    )
  }

  return (
    <div className='flex flex-row items-center gap-1'>
      <Icon name='creditCard' color='foregroundMuted' />
      <Text.H6B>Stripe ID:</Text.H6B>

      {stripeCustomerId && (
        <ClickToCopy copyValue={stripeCustomerId}>
          <Text.H6 color='foregroundMuted' monospace>
            {stripeCustomerId}
          </Text.H6>
        </ClickToCopy>
      )}
      {!stripeCustomerId && (
        <Text.H6 color='foregroundMuted'>No Stripe ID</Text.H6>
      )}
    </div>
  )
}

export function SubscriptionRow({
  workspaceId,
  workspaceName,
  stripeCustomerId: initialStripeCustomerId,
  subscription,
  showWorkspaceInfo = false,
}: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

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
  const hasMissingStripeId = !initialStripeCustomerId && !isFreePlan

  const { execute: executeStripeUpdate, isPending: isStripeUpdating } =
    useLatitudeAction(assignStripeCustomerIdAction, {
      onSuccess: () => {
        toast({
          title: 'Success',
          description: 'Stripe Customer ID updated',
        })
        router.refresh()
        setIsEditModalOpen(false)
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
          description: cancelledAt
            ? 'Cancellation scheduled'
            : 'Cancellation cleared',
        })
        router.refresh()
        setIsEditModalOpen(false)
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

  const handleClearCancellation = () => {
    setCancelledAt('')
    executeCancelUpdate({
      workspaceId,
      cancelledAt: null,
    })
  }

  const stripeHasChanged = stripeCustomerId !== (initialStripeCustomerId ?? '')
  const cancelHasChanged =
    cancelledAt !== formatDateForInput(subscription.cancelledAt)

  return (
    <>
      <div
        className={`flex flex-col gap-2 p-4 rounded-lg ${
          hasMissingStripeId
            ? 'bg-destructive/10 border border-destructive/30'
            : 'bg-muted/30'
        }`}
      >
        {/* Row 1: Workspace | Stripe ID | Warnings | Edit */}
        <div className='flex flex-row items-center justify-between gap-4'>
          <div className='flex flex-row items-center gap-4 flex-wrap flex-1 min-w-0'>
            <div className='flex flex-row items-center gap-2'>
              {showWorkspaceInfo ? (
                <Link href={ROUTES.backoffice.search.workspace(workspaceId)}>
                  <div className='flex flex-row items-center gap-2'>
                    <Text.H5>{workspaceName}</Text.H5>
                    <Text.H6 color='foregroundMuted' monospace>
                      #{workspaceId}
                    </Text.H6>
                    <Icon name='externalLink' />
                  </div>
                </Link>
              ) : (
                <Text.H5>Billing Information</Text.H5>
              )}
              <Badge variant={isFreePlan ? 'muted' : 'accent'}>
                {formatPlanName(subscription.plan)}
              </Badge>
              {hasInvalidTrial && (
                <Badge variant='warningMuted' size='small'>
                  Trial Active
                </Badge>
              )}
            </div>
          </div>

          <Button
            variant='outline'
            size='small'
            fancy
            onClick={() => setIsEditModalOpen(true)}
          >
            Edit
          </Button>
        </div>

        <div className='flex flex-row items-center gap-4 flex-wrap'>
          <div className='flex flex-row items-center gap-1'>
            <StripeId
              stripeCustomerId={initialStripeCustomerId}
              subscription={subscription}
            />
          </div>
          <ClientOnly
            loader={<Text.H6 color='foregroundMuted'>Loading...</Text.H6>}
          >
            <Text.H6 color='foregroundMuted'>
              Billing:{' '}
              {new Date(subscription.billableFrom).toLocaleDateString()} –{' '}
              {new Date(subscription.billableAt).toLocaleDateString()}
            </Text.H6>
          </ClientOnly>

          {isCancelled ? (
            <Text.H6 color='destructive'>
              Cancels {new Date(subscription.cancelledAt!).toLocaleDateString()}
            </Text.H6>
          ) : (
            <Text.H6 color='foregroundMuted'>Active</Text.H6>
          )}
        </div>
      </div>

      <Modal
        dismissible
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        title={
          showWorkspaceInfo && workspaceName
            ? `Edit Subscription - ${workspaceName}`
            : 'Edit Subscription'
        }
        description='Update Stripe integration and cancellation settings'
      >
        <div className='flex flex-col gap-6'>
          <div className='flex flex-col gap-3'>
            <div className='flex flex-row items-center justify-between'>
              <Text.H5>Stripe Customer ID</Text.H5>
              {initialStripeCustomerId && (
                <a
                  href={`https://dashboard.stripe.com/customers/${initialStripeCustomerId}`}
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  <Button variant='ghost' size='small'>
                    <div className='flex flex-row items-center gap-1'>
                      <Text.H6>Open in Stripe</Text.H6>
                      <Icon name='externalLink' size='small' />
                    </div>
                  </Button>
                </a>
              )}
            </div>
            <div className='flex flex-row gap-2'>
              <div className='flex-1'>
                <Input
                  placeholder='cus_xxxxxxxxxxxxxx'
                  value={stripeCustomerId}
                  onChange={(e) => setStripeCustomerId(e.target.value)}
                  disabled={isStripeUpdating}
                />
              </div>
              <Button
                variant='outline'
                onClick={handleStripeSave}
                disabled={isStripeUpdating || !stripeHasChanged}
              >
                {isStripeUpdating ? 'Saving...' : 'Update'}
              </Button>
            </div>
          </div>

          <div className='flex flex-col gap-3'>
            <Text.H5>Schedule Cancellation</Text.H5>
            <Text.H6 color='foregroundMuted'>
              Set a future date to automatically cancel this subscription
            </Text.H6>
            <div className='flex flex-row gap-2'>
              <div className='flex-1'>
                <Input
                  type='date'
                  value={cancelledAt}
                  onChange={(e) => setCancelledAt(e.target.value)}
                  disabled={isCancelUpdating}
                />
              </div>
              {subscription.cancelledAt ? (
                <Button
                  variant='outline'
                  onClick={handleClearCancellation}
                  disabled={isCancelUpdating}
                >
                  {isCancelUpdating ? 'Clearing...' : 'Clear'}
                </Button>
              ) : (
                <Button
                  variant={cancelledAt ? 'outlineDestructive' : 'outline'}
                  onClick={handleCancelSave}
                  disabled={isCancelUpdating || !cancelHasChanged}
                >
                  {isCancelUpdating ? 'Scheduling...' : 'Schedule'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </>
  )
}
