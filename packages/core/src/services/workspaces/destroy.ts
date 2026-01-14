import { eq } from 'drizzle-orm'

import { findFirstUserInWorkspace } from '../../data-access/users'
import { Result } from '../../lib/Result'
import { getStripe } from '../../lib/stripe'
import Transaction from '../../lib/Transaction'
import { apiKeys } from '../../schema/models/apiKeys'
import { claimedRewards } from '../../schema/models/claimedRewards'
import { integrations } from '../../schema/models/integrations'
import { providerApiKeys } from '../../schema/models/providerApiKeys'
import { subscriptions } from '../../schema/models/subscriptions'
import { workspaces } from '../../schema/models/workspaces'
import type { Workspace } from '../../schema/models/types/Workspace'
import { getStripeCustomer } from '../billing/stripeCustomer'

/**
 * Permanently destroys a workspace and all associated data.
 * This is a destructive operation that cannot be undone.
 *
 * Handles cleanup of tables that don't have cascade delete:
 * - providerApiKeys
 * - apiKeys
 * - claimedRewards
 * - integrations
 * - subscriptions
 *
 * Also cancels any active Stripe subscriptions associated with the workspace.
 *
 * All other related tables (projects, memberships, etc.) are handled
 * by database cascade delete constraints.
 */
export async function destroyWorkspace(
  workspace: Workspace,
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const workspaceId = workspace.id

    // Cancel Stripe subscriptions if Stripe is configured
    const stripeResult = getStripe()
    if (stripeResult.ok) {
      const stripe = stripeResult.value
      const user = await findFirstUserInWorkspace(workspace)

      if (user?.email) {
        try {
          const customer = await getStripeCustomer({ email: user.email }, stripe)

          if (customer) {
            // Get all active subscriptions for this customer
            const activeSubscriptions = await stripe.subscriptions.list({
              customer: customer.id,
              status: 'active',
            })

            // Cancel each active subscription
            for (const subscription of activeSubscriptions.data) {
              await stripe.subscriptions.cancel(subscription.id)
            }
          }
        } catch (error) {
          // Log the error but continue with workspace deletion
          // We don't want Stripe errors to block workspace deletion
          console.error('Error cancelling Stripe subscriptions:', error)
        }
      }
    }

    await tx
      .delete(providerApiKeys)
      .where(eq(providerApiKeys.workspaceId, workspaceId))

    await tx.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId))

    await tx
      .delete(claimedRewards)
      .where(eq(claimedRewards.workspaceId, workspaceId))

    await tx
      .delete(integrations)
      .where(eq(integrations.workspaceId, workspaceId))

    await tx.delete(workspaces).where(eq(workspaces.id, workspaceId))

    await tx
      .delete(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId))

    return Result.ok(workspace)
  })
}
