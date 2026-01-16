import { eq } from 'drizzle-orm'
import Stripe from 'stripe'
import { type Subscription } from '../../schema/models/types/Subscription'
import { type Workspace } from '../../schema/models/types/Workspace'
import { Database } from '../../client'
import { unsafelyFindUserByEmail } from '../../data-access/users'
import { unsafelyFindWorkspacesFromUser } from '../../data-access/workspaces'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { LatitudeError } from '../../lib/errors'
import { STRIPE_PLANS, SubscriptionPlans } from '../../plans'
import { subscriptions } from '../../schema/models/subscriptions'
import { workspaces } from '../../schema/models/workspaces'
import { issueSubscriptionGrants } from '../subscriptions/grants'
import { publisher } from '../../events/publisher'
import { createSubscription } from '../subscriptions/create'

function findTargetPlan({
  stripeSubscription,
}: {
  stripeSubscription: Stripe.Subscription
}) {
  const priceId = stripeSubscription.items.data
    .map((item) => item.price.id)
    .at(0)

  const plan = STRIPE_PLANS.find(
    (plan) => SubscriptionPlans[plan].stripePriceId === priceId,
  )
  if (!priceId || !plan) {
    throw new LatitudeError(
      'Could not determine subscription plan from Stripe subscription items.',
      {
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId:
          typeof stripeSubscription.customer === 'object'
            ? stripeSubscription.customer.id
            : stripeSubscription.customer?.toString(),
      },
    )
  }

  return plan
}

export async function handleSubscriptionUpdate(
  {
    stripeSubscription,
    stripe,
  }: {
    stripeSubscription: Stripe.Subscription
    stripe: Stripe
    db?: Database // Allow overriding db instance, e.g., for transactions or testing
  },
  transaction = new Transaction(),
): Promise<
  TypedResult<{
    workspace: Workspace
    subscription: Subscription | null
  }>
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

  const customerEmail = stripeCustomer.email
  if (!customerEmail) {
    return Result.error(
      new LatitudeError('Stripe customer does not have an email.', {
        stripeCustomerId: stripeSubscription.customer,
      }),
    )
  }

  return await transaction.call(
    async (tx) => {
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
      // FIXME: This is not ok. If a user sign with a second email the payment
      // will go to the first workspace found.
      const unsafeWorkspace = await unsafelyFindWorkspacesFromUser(
        user.id,
        tx,
      ).then((workspaces) => workspaces[0])
      if (!unsafeWorkspace) {
        throw new LatitudeError(`No workspace found for user ${user.id}.`, {
          userId: user.id,
        })
      }

      const workspace = unsafeWorkspace as Workspace
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

      // 5. If the subscription is active, determine the target plan from Stripe
      if (stripeSubscription.status === 'active') {
        const targetPlan = findTargetPlan({ stripeSubscription })
        const currentPlan = currentSubscription?.plan
        // Already upgraded to the same or higher tier plan
        if (currentPlan && currentPlan === targetPlan) {
          return Result.ok({
            workspace,
            user,
            subscription: currentSubscription,
          })
        }

        const newSubscription = await createSubscription(
          { workspace, plan: targetPlan },
          transaction,
        ).then((r) => r.unwrap())

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

        await issueSubscriptionGrants(
          { subscription: newSubscription, workspace },
          transaction,
        ).then((r) => r.unwrap())

        return Result.ok({
          user,
          workspace: updatedWorkspace,
          subscription: newSubscription,
        })
      }

      return Result.ok({ workspace, user, subscription: currentSubscription })
    },
    ({ workspace, subscription, user }) => {
      publisher.publishLater({
        type: 'subscriptionUpdated',
        data: {
          userEmail: user.email,
          workspace,
          subscription,
        },
      })
    },
  )
}
