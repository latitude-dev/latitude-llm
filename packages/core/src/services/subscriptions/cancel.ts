import { eq } from 'drizzle-orm'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { subscriptions } from '../../schema/models/subscriptions'
import { Subscription } from '../../schema/models/types/Subscription'
import { Workspace, WorkspaceDto } from '../../schema/models/types/Workspace'

/**
 * Sets or clears the cancellation date for a subscription.
 *
 * When setting a date: marks the subscription for cancellation. A nightly job
 * (`processCancelledSubscriptionsJob`) runs daily at 3 AM to find subscriptions
 * where `cancelledAt` is in the past and downgrades them to HobbyV3.
 *
 * When clearing (null): removes the scheduled cancellation.
 *
 * This approach ensures users retain access until their paid period ends,
 * regardless of when they initiated the cancellation.
 */
export async function cancelSubscription(
  {
    workspace,
    subscription,
    userEmail,
    cancelledAt,
  }: {
    workspace: Workspace | WorkspaceDto
    subscription: Subscription
    userEmail: string
    cancelledAt: Date | null
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
      publisher.publishLater({
        type: 'subscriptionEnqueuedForCancellation',
        data: {
          workspaceId: workspace.id,
          subscriptionId: updatedSubscription.id,
          cancellationDate: cancelledAt
            ? cancelledAt.toISOString()
            : 'uncancelled',
          userEmail,
        },
      })
    },
  )
}
