import { eq } from 'drizzle-orm'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { subscriptions } from '../../schema/models/subscriptions'
import { Subscription } from '../../schema/models/types/Subscription'

export async function updateTrialEndsAt(
  {
    subscription,
    trialEndsAt,
  }: {
    subscription: Subscription
    trialEndsAt: Date | null
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const [updatedSubscription] = await tx
      .update(subscriptions)
      .set({ trialEndsAt })
      .where(eq(subscriptions.id, subscription.id))
      .returning()

    return Result.ok(updatedSubscription!)
  })
}
