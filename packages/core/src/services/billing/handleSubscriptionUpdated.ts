import Stripe from 'stripe'
import { BillingError } from '@latitude-data/constants/errors'
import {
  WorkspaceDto,
  type Workspace,
} from '../../schema/models/types/Workspace'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { SubscriptionRepository } from '../../repositories'
import { issueSubscriptionGrants } from '../subscriptions/grants'
import { publisher } from '../../events/publisher'
import { createSubscription } from '../subscriptions/create'
import { updateWorkspace } from '../workspaces/update'
import {
  ensureSubscriptionIsActive,
  findTargetPlan,
  getStripeCustomerId,
} from './utils'
import { findFirstUserInWorkspace } from '../../data-access/users'

/**
 * Handles `customer.subscription.updated` webhook events for active subscriptions.
 *
 * This service ONLY processes subscriptions with status 'active'. Other statuses
 * (past_due, canceled, unpaid, incomplete, trialing) should be filtered at the
 * webhook endpoint level before calling this service.
 *
 * This handler assumes the Stripe customer is already linked to a workspace
 * (via a previous `subscription.created` event or checkout flow).
 *
 * It updates the subscription plan if the customer changed plans via
 * the Stripe Customer Portal.
 */
export async function handleSubscriptionUpdated(
  {
    workspace,
    stripeSubscription,
  }: {
    workspace: WorkspaceDto
    stripeSubscription: Stripe.Subscription
  },
  transaction = new Transaction(),
) {
  const stripeCustomerId = getStripeCustomerId(stripeSubscription.customer)

  return await transaction.call(
    async (tx) => {
      ensureSubscriptionIsActive({ workspace, stripeSubscription })

      const subscriptionRepo = new SubscriptionRepository(workspace.id, tx)
      const result = await subscriptionRepo.find(
        workspace.currentSubscriptionId,
      )
      if (result.error) {
        throw new BillingError(
          `Failed to retrieve current subscription ${workspace.currentSubscriptionId} for workspace ${workspace.id}`,
          { tags: { workspaceId: workspace.id, stripeCustomerId } },
        )
      }

      const currentSubscription = result.value
      const targetPlan = findTargetPlan(stripeSubscription)
      const currentPlan = currentSubscription.plan

      if (currentPlan && currentPlan === targetPlan) {
        return Result.ok({ workspace, subscription: currentSubscription })
      }

      const newSubscription = await createSubscription(
        { workspace, plan: targetPlan },
        transaction,
      ).then((r) => r.unwrap())

      const updatedWorkspace = await updateWorkspace(
        workspace,
        { currentSubscriptionId: newSubscription.id },
        transaction,
      ).then((r) => r.unwrap())

      await issueSubscriptionGrants(
        { subscription: newSubscription, workspace },
        transaction,
      ).then((r) => r.unwrap())

      return Result.ok({
        workspace: updatedWorkspace as Workspace,
        subscription: newSubscription,
      })
    },
    async ({ workspace, subscription }) => {
      const firstUser = await findFirstUserInWorkspace(workspace)
      publisher.publishLater({
        type: 'subscriptionUpdated',
        data: { workspace, subscription, userEmail: firstUser.email },
      })
    },
  )
}
