import Stripe from 'stripe'
import { Result } from '../../lib/Result'
import { handleSubscriptionCreated } from './handleSubscriptionCreated'
import { handleSubscriptionUpdated } from './handleSubscriptionUpdated'
import { findWorkspaceFromStripeSubscription } from './findWorkspaceFromStripeSubscription'

export async function handleSubscriptionUpdatedOrCreated({
  stripeSubscription,
}: {
  stripeSubscription: Stripe.Subscription
}) {
  const result = await findWorkspaceFromStripeSubscription({
    stripeSubscription,
  })

  if (Result.isOk(result)) {
    return handleSubscriptionUpdated({
      workspace: result.value,
      stripeSubscription,
    })
  }

  return handleSubscriptionCreated({ stripeSubscription })
}
