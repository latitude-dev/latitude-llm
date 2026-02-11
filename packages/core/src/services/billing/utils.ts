import Stripe from 'stripe'
import { BillingError } from '@latitude-data/constants/errors'
import { STRIPE_PLANS, SubscriptionPlans } from '../../plans'
import { Workspace } from '../../schema/models/types/Workspace'
import { workspaceUsersScope } from '../../queries/users/scope'
import { findFirstUserInWorkspace } from '../../queries/users/findFirstInWorkspace'
import { Result } from '../../lib/Result'

/**
 * Extracts the Stripe customer ID from various customer representations.
 *
 * Stripe's API can return customer data in different formats depending on
 * whether the object was expanded in the API request:
 * - String: The customer ID (e.g., "cus_xxx") when not expanded
 * - Stripe.Customer: Full customer object when expanded
 * - Stripe.DeletedCustomer: Deleted customer object when expanded and customer was deleted
 *
 * @see https://docs.stripe.com/api/expanding_objects
 */
export function getStripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer,
): string {
  return typeof customer === 'string' ? customer : customer.id
}

export function ensureSubscriptionIsActive({
  workspace,
  stripeSubscription,
}: {
  workspace: Workspace
  stripeSubscription: Stripe.Subscription
}) {
  if (stripeSubscription.status !== 'active') {
    const stripeCustomerId = getStripeCustomerId(stripeSubscription.customer)
    throw new BillingError(
      `Stripe subscription ${stripeSubscription.id} is not active.`,
      { tags: { stripeCustomerId, workspaceId: workspace.id } },
    )
  }
}

export function findTargetPlan(stripeSubscription: Stripe.Subscription) {
  const priceId = stripeSubscription.items.data
    .map((item) => item.price.id)
    .at(0)
  const stripeCustomerId = getStripeCustomerId(stripeSubscription.customer)

  const plan = STRIPE_PLANS.find(
    (plan) => SubscriptionPlans[plan].stripePriceId === priceId,
  )
  if (!priceId || !plan) {
    throw new BillingError(
      'Could not determine subscription plan from Stripe subscription items.',
      { tags: { stripeCustomerId } },
    )
  }

  return plan
}

export async function getFirstUserAsBillingActor(workspace: Workspace) {
  const usersInWorkspace = workspaceUsersScope(workspace.id)
  const user = await findFirstUserInWorkspace(usersInWorkspace)

  if (!user) {
    return Result.error(
      new BillingError(`No users found in workspace with id ${workspace.id}`, {
        tags: { workspaceId: workspace.id },
      }),
    )
  }

  return Result.ok(user)
}
