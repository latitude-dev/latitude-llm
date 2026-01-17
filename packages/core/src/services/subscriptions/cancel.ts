import { eq } from 'drizzle-orm'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { subscriptions } from '../../schema/models/subscriptions'
import { Subscription } from '../../schema/models/types/Subscription'
import { Workspace } from '../../schema/models/types/Workspace'
import { findFirstUserInWorkspace } from '../../data-access/users'

/**
 * Marks a subscription for cancellation by setting its `cancelledAt` date.
 *
 * This does NOT immediately downgrade the workspace. Instead, a nightly job
 * (`processCancelledSubscriptionsJob`) runs daily at 3 AM to find subscriptions
 * where `cancelledAt` is in the past and downgrades them to HobbyV3.
 *
 * This approach ensures users retain access until their paid period ends,
 * regardless of when they initiated the cancellation.
 */
export async function cancelSubscription(
  {
    workspace,
    subscription,
    cancelledAt,
    stripeCustomerId,
  }: {
    workspace: Workspace
    subscription: Subscription
    cancelledAt: Date
    stripeCustomerId: string
  },
  transaction = new Transaction(),
) {
  return transaction.call(
    async (tx) => {
      const [updatedSubscription] = await tx
        .update(subscriptions)
        .set({ cancelledAt })
        .where(eq(subscriptions.id, subscription.id))
        .returning()

      return Result.ok(updatedSubscription!)
    },
    async (updatedSubscription) => {
      const firstUser = await findFirstUserInWorkspace(workspace)
      publisher.publishLater({
        type: 'subscriptionEnqueuedForCancellation',
        data: {
          workspaceId: workspace.id,
          subscriptionId: updatedSubscription.id,
          stripeCustomerId,
          cancellationDate: cancelledAt.toISOString(),
          userEmail: firstUser.email,
        },
      })
    },
  )
}
