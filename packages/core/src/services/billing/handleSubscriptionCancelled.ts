import Stripe from 'stripe'
import { BillingError } from '@latitude-data/constants/errors'
import { SubscriptionRepository } from '../../repositories'
import { getFirstUserAsBillingActor, getStripeCustomerId } from './utils'
import { findWorkspaceFromStripeSubscription } from './findWorkspaceFromStripeSubscription'
import { cancelSubscription } from '../subscriptions/cancel'
import { Result } from '../../lib/Result'

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

  const result = await findWorkspaceFromStripeSubscription({
    stripeSubscription,
  })

  if (result.error) return result

  const workspace = result.value
  const subscriptionRepo = new SubscriptionRepository(workspace.id)
  const subscriptionResult = await subscriptionRepo.find(
    workspace.currentSubscriptionId,
  )

  if (subscriptionResult.error) {
    return Result.error(
      new BillingError(
        `Failed to retrieve current subscription for workspace ${workspace.id}`,
        { tags: { stripeCustomerId, workspaceId: workspace.id } },
      ),
    )
  }

  const subscription = subscriptionResult.value
  const sub = stripeSubscription as StripeSubscriptionWithPeriod
  const cancelledAt = new Date(sub.current_period_end * 1000)

  const userResult = await getFirstUserAsBillingActor(workspace)

  if (userResult.error) return userResult

  const userEmail = userResult.value.email

  return cancelSubscription({
    workspace,
    subscription,
    cancelledAt,
    userEmail,
  })
}
