import { Workspace } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { SubscriptionPlans } from '../../plans'
import { subscriptions } from '../../schema/models/subscriptions'

export function createSubscription(
  {
    workspace,
    plan,
    createdAt,
  }: {
    workspace: Workspace
    plan: keyof typeof SubscriptionPlans
    createdAt?: Date
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const subscription = await tx
      .insert(subscriptions)
      .values({
        workspaceId: workspace.id,
        plan,
        createdAt,
      })
      .returning()

    return Result.ok(subscription[0]!)
  })
}
