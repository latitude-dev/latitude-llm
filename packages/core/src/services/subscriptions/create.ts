import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  FREE_PLANS,
  getTrialEndDateFromNow,
  SubscriptionPlans,
} from '../../plans'
import { subscriptions } from '../../schema/models/subscriptions'
import { type Workspace } from '../../schema/models/types/Workspace'

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
  const isTrial = FREE_PLANS.includes(plan)
  const trialEndsAt = isTrial ? getTrialEndDateFromNow() : undefined

  return transaction.call(async (tx) => {
    const subscription = await tx
      .insert(subscriptions)
      .values({
        workspaceId: workspace.id,
        plan,
        createdAt,
        trialEndsAt,
      })
      .returning()

    return Result.ok(subscription[0]!)
  })
}
