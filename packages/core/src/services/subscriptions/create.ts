import { Workspace } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { SubscriptionPlans } from '../../plans'
import { subscriptions } from '../../schema/models/subscriptions'

export function createSubscription(
  {
    workspace,
    plan,
  }: {
    workspace: Workspace
    plan: keyof typeof SubscriptionPlans
  },
  db = database,
) {
  return Transaction.call(async (tx) => {
    const subscription = await tx
      .insert(subscriptions)
      .values({
        workspaceId: workspace.id,
        plan,
      })
      .returning()

    return Result.ok(subscription[0]!)
  }, db)
}
