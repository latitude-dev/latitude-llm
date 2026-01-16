import Stripe from 'stripe'
import { BillingError } from '@latitude-data/constants/errors'
import { SubscriptionRepository } from '../../repositories'
import { getStripeCustomerId } from './utils'
import { unsafelyFindWorkspaceByStripeCustomerId } from '../../data-access/workspaces'
import { cancelSubscription } from '../subscriptions/cancel'

type StripeSubscriptionWithPeriod = Stripe.Subscription & {
  current_period_end: number
}

/**
 * Handles `customer.subscription.deleted` webhook events.
 *
 * When a subscription is cancelled (via Stripe Customer Portal or API),
 * we record `current_period_end` as the cancellation date. This ensures
 * users retain access until the end of their paid period regardless of
 * how the cancellation was initiated.
 *
 * A nightly job (`processCancelledSubscriptionsJob`) runs daily to find
 * subscriptions where `cancelledAt` is in the past and downgrades them to HobbyV3.
 */
export async function handleSubscriptionCancelled({
  stripeSubscription,
}: {
  stripeSubscription: Stripe.Subscription
}) {
  const stripeCustomerId = getStripeCustomerId(stripeSubscription.customer)

  const workspace =
    await unsafelyFindWorkspaceByStripeCustomerId(stripeCustomerId)

  if (!workspace) {
    throw new BillingError(
      `No workspace found with stripeCustomerId ${stripeCustomerId}`,
      { tags: { stripeCustomerId } },
    )
  }

  const subscriptionRepo = new SubscriptionRepository(workspace.id)
  const result = await subscriptionRepo.find(workspace.currentSubscriptionId)

  if (result.error) {
    throw new BillingError(
      `Failed to retrieve current subscription for workspace ${workspace.id}`,
      { tags: { stripeCustomerId, workspaceId: workspace.id } },
    )
  }

  const subscription = result.value
  const sub = stripeSubscription as StripeSubscriptionWithPeriod
  const cancelledAt = new Date(sub.current_period_end * 1000)

  return cancelSubscription({
    workspace,
    subscription,
    cancelledAt,
    stripeCustomerId,
  })
}
