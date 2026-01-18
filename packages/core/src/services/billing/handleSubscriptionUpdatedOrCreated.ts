import Stripe from 'stripe'
import { unsafelyFindWorkspaceByStripeCustomerId } from '../../data-access/workspaces'
import { handleSubscriptionCreated } from './handleSubscriptionCreated'
import { handleSubscriptionUpdated } from './handleSubscriptionUpdated'
import { getStripeCustomerId } from './utils'

export async function handleSubscriptionUpdatedOrCreated({
  stripeSubscription,
}: {
  stripeSubscription: Stripe.Subscription
}) {
  const stripeCustomerId = getStripeCustomerId(stripeSubscription.customer)
  const workspace =
    await unsafelyFindWorkspaceByStripeCustomerId(stripeCustomerId)

  if (workspace) {
    return handleSubscriptionUpdated({ workspace, stripeSubscription })
  }

  return handleSubscriptionCreated({ stripeSubscription })
}
