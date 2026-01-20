import Stripe from 'stripe'
import { type Subscription } from '../../schema/models/types/Subscription'
import { type Workspace } from '../../schema/models/types/Workspace'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { issueSubscriptionGrants } from '../subscriptions/grants'
import { publisher } from '../../events/publisher'
import { createSubscription } from '../subscriptions/create'
import { updateWorkspace } from '../workspaces/update'
import { assignStripeCustomerId } from '../workspaces/assignStripeCustomerId'
import {
  ensureSubscriptionIsActive,
  findTargetPlan,
  getFirstUserAsBillingActor,
  getStripeCustomerId,
} from './utils'
import { findFirstUserInWorkspace } from '../../data-access/users'
import { findWorkspaceFromStripeCheckoutSession } from './findWorkspaceFromCheckoutSession'
import { handleSubscriptionUpdated } from './handleSubscriptionUpdated'

/**
 * Handles `customer.subscription.created` webhook events.
 *
 * This handler expects the subscription to have `metadata.workspaceId` set,
 * which is configured when creating the Checkout Session.
 *
 * It links the Stripe customer to the workspace and creates the subscription.
 *
 * Race condition handling: If another webhook already assigned the stripeCustomerId
 * to this workspace (e.g., concurrent subscription.created and subscription.updated
 * events), we delegate to handleSubscriptionUpdated instead of creating a duplicate.
 */
export async function handleSubscriptionCreated(
  { stripeSubscription }: { stripeSubscription: Stripe.Subscription },
  transaction = new Transaction(),
): Promise<
  TypedResult<{
    workspace: Workspace
    subscription: Subscription | null
  }>
> {
  const stripeCustomerId = getStripeCustomerId(stripeSubscription.customer)

  type TransactionResult = {
    workspace: Workspace
    subscription: Subscription | null
  }

  return await transaction.call<TransactionResult>(
    async (tx) => {
      const workspaceRecord = await findWorkspaceFromStripeCheckoutSession(
        { stripeSubscription },
        tx,
      ).then((r) => r.unwrap())

      // Race condition handling:
      // If the workspace already has a Stripe customer ID, another webhook
      // (likely subscription.updated) has already processed this subscription.
      // Delegate to that handler to avoid creating duplicate subscriptions.
      if (workspaceRecord.stripeCustomerId) {
        return handleSubscriptionUpdated(
          { workspace: workspaceRecord, stripeSubscription },
          transaction,
        )
      }

      const user = await getFirstUserAsBillingActor(workspaceRecord).then((r) =>
        r.unwrap(),
      )
      const workspace = await assignStripeCustomerId(
        {
          workspace: workspaceRecord,
          stripeCustomerId,
          userEmail: user.email,
          origin: 'webhook',
        },
        transaction,
      ).then((r) => r.unwrap())

      ensureSubscriptionIsActive({ workspace, stripeSubscription })

      const targetPlan = findTargetPlan(stripeSubscription)

      const subscription = await createSubscription(
        { workspace, plan: targetPlan },
        transaction,
      ).then((r) => r.unwrap())

      const updatedWorkspace = await updateWorkspace(
        workspace,
        { currentSubscriptionId: subscription.id },
        transaction,
      ).then((r) => r.unwrap())

      await issueSubscriptionGrants(
        { subscription, workspace },
        transaction,
      ).then((r) => r.unwrap())

      return Result.ok({
        workspace: updatedWorkspace,
        subscription,
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
