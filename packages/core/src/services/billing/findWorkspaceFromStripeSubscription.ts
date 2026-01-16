import Stripe from 'stripe'
import { BillingError } from '@latitude-data/constants/errors'
import { database, Database } from '../../client'
import { Result } from '../../lib/Result'
import { getStripeCustomerId } from './utils'
import { unsafelyFindWorkspaceByStripeCustomerId } from '../../data-access/workspaces'

/**
 * Finds the workspace associated with a Stripe subscription created via our Checkout Session.
 *
 * When we create a Checkout Session, we set `subscription_data.metadata.workspaceId`
 * to link the resulting subscription back to our workspace. This function extracts
 * that workspace ID and fetches the workspace.
 *
 * @returns The workspace if found, or an error if metadata is missing or workspace doesn't exist
 */
export async function findWorkspaceFromStripeSubscription(
  {
    stripeSubscription,
  }: {
    stripeSubscription: Stripe.Subscription
  },
  db: Database = database,
) {
  const stripeCustomerId = getStripeCustomerId(stripeSubscription.customer)
  const workspace = await unsafelyFindWorkspaceByStripeCustomerId(
    stripeCustomerId,
    db,
  )

  if (!workspace) {
    return Result.error(
      new BillingError(
        `Workspace with Stripe customer ID ${stripeCustomerId} not found`,
        {
          tags: { stripeCustomerId },
        },
      ),
    )
  }

  return Result.ok(workspace)
}
