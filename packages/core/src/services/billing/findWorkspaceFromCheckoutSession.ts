import { BillingError } from '@latitude-data/constants/errors'
import Stripe from 'stripe'
import { Database, database } from '../../client'
import { Result } from '../../lib/Result'
import { getStripeCustomerId } from './utils'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'

/**
 * Finds the workspace associated with a Stripe subscription created via
 * our Checkout Session.
 *
 * When we create a Checkout Session, we set `subscription_data.metadata.workspaceId`
 * to link the resulting subscription back to our workspace. This function extracts
 * that workspace ID and fetches the workspace.
 *
 * @returns The workspace if found, or an error if metadata is missing or workspace doesn't exist
 */
export async function findWorkspaceFromStripeCheckoutSession(
  {
    stripeSubscription,
  }: {
    stripeSubscription: Stripe.Subscription
  },
  db: Database = database,
) {
  const stripeCustomerId = getStripeCustomerId(stripeSubscription.customer)
  const workspaceId = stripeSubscription.metadata?.workspaceId

  if (!workspaceId) {
    return Result.error(
      new BillingError(
        'Subscription metadata is missing workspaceId. This subscription was not created via our Checkout Session.',
        { tags: { stripeCustomerId } },
      ),
    )
  }

  const workspace = await unsafelyFindWorkspace(parseInt(workspaceId, 10), db)

  if (!workspace) {
    return Result.error(
      new BillingError(`Workspace ${workspaceId} not found`, {
        tags: { workspaceId: parseInt(workspaceId, 10), stripeCustomerId },
      }),
    )
  }

  return Result.ok(workspace)
}
