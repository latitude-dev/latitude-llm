import Stripe from 'stripe'
import { eq } from 'drizzle-orm'

import { database, Database } from '../../client'
import { workspaces } from '../../schema/models/workspaces'
import { subscriptions } from '../../schema/models/subscriptions'
import { SubscriptionPlan } from '../../plans'
import { Result, TypedResult } from '../../lib/Result'
import { LatitudeError } from '../../lib/errors'
import {
  unsafelyFindUserByEmail,
  unsafelyFindWorkspacesFromUser,
} from '../../data-access'
import { Subscription, Workspace } from '../../browser'
import Transaction from '../../lib/Transaction'

// Infer the transaction type from the Drizzle instance
export type TransactionType = Parameters<
  Parameters<Database['transaction']>[0]
>[0]

interface HandleSubscriptionUpdateParams {
  stripeSubscription: Stripe.Subscription
  stripe: Stripe
  db?: Database // Allow overriding db instance, e.g., for transactions or testing
}

export async function handleSubscriptionUpdate(
  { stripeSubscription, stripe }: HandleSubscriptionUpdateParams,
  db = database,
): Promise<
  TypedResult<{ workspace: Workspace; subscription: Subscription }, Error>
> {
  // Ensure stripeSubscription.customer is a string (ID) before using it
  if (typeof stripeSubscription.customer !== 'string') {
    return Result.error(
      new LatitudeError('Stripe customer ID is not a string.', {
        stripeCustomerId: stripeSubscription.customer.id,
      }),
    )
  }

  // 1. Retrieve Stripe Customer to get email
  const stripeCustomer = await stripe.customers.retrieve(
    stripeSubscription.customer,
  )
  if (stripeCustomer.deleted) {
    return Result.error(
      new LatitudeError('Stripe customer has been deleted.', {
        stripeCustomerId: stripeSubscription.customer,
      }),
    )
  }
  const customerEmail = (stripeCustomer as Stripe.Customer).email
  if (!customerEmail) {
    return Result.error(
      new LatitudeError('Stripe customer does not have an email.', {
        stripeCustomerId: stripeSubscription.customer,
      }),
    )
  }

  return await Transaction.call(async (tx) => {
    // 2. Find user by email in our database
    const user = await unsafelyFindUserByEmail(customerEmail, tx)
    if (!user) {
      throw new LatitudeError(`User with email ${customerEmail} not found.`, {
        stripeCustomerId:
          typeof stripeSubscription.customer === 'object'
            ? stripeSubscription.customer.id
            : stripeSubscription.customer?.toString(),
      })
    }

    // 3. Find the first workspace for this user
    const workspace = await unsafelyFindWorkspacesFromUser(user.id, tx).then(
      (workspaces) => workspaces[0],
    )
    if (!workspace) {
      throw new LatitudeError(`No workspace found for user ${user.id}.`, {
        userId: user.id,
      })
    }

    // 4. Check workspace's active subscription
    let currentSubscription: Subscription | null = null
    if (workspace.currentSubscriptionId) {
      const [subscription] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, workspace.currentSubscriptionId))
        .limit(1)

      if (subscription) {
        currentSubscription = subscription
      }
    }

    // 5. If the subscription is active and plan is not team_v1, create/update
    if (stripeSubscription.status === 'active') {
      // For this example, we're focusing on upgrading to TeamV1
      const targetPlan = SubscriptionPlan.TeamV1
      if (currentSubscription?.plan === targetPlan) {
        return Result.ok({ workspace, subscription: currentSubscription })
      }

      // Create new subscription record with the target plan
      const [newSubscription] = await tx
        .insert(subscriptions)
        .values({
          workspaceId: workspace.id,
          plan: targetPlan,
          // TODO: Potentially store Stripe subscription ID, current period end, etc.
          // stripeSubscriptionId: stripeSubscription.id,
          // currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
          // currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
          // status: stripeSubscription.status,
        })
        .returning()
      if (!newSubscription) {
        throw new LatitudeError('Failed to create new subscription record.', {
          workspaceId: workspace.id.toString(),
          plan: targetPlan,
        })
      }

      // Assign it as the workspace's current subscription
      const [updatedWorkspace] = await tx
        .update(workspaces)
        .set({ currentSubscriptionId: newSubscription.id })
        .where(eq(workspaces.id, workspace.id))
        .returning()
      if (!updatedWorkspace) {
        throw new LatitudeError(
          'Failed to update workspace with new subscription.',
          {
            workspaceId: workspace.id.toString(),
          },
        )
      }

      return Result.ok({
        workspace: updatedWorkspace,
        subscription: newSubscription,
      })
    }

    return Result.ok({ workspace, subscription: currentSubscription! })
  }, db)
}
