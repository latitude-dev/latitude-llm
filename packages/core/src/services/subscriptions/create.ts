import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  FREE_PLANS,
  getTrialEndDateFromNow,
  SubscriptionPlans,
} from '../../plans'
import { subscriptions } from '../../schema/models/subscriptions'
import { type Workspace } from '../../schema/models/types/Workspace'

type SubscriptionPlan = keyof typeof SubscriptionPlans

function getTrialEndDate({
  createWithTrialExpired,
  plan,
}: {
  createWithTrialExpired: boolean
  plan: SubscriptionPlan
}): Date | undefined {
  if (createWithTrialExpired) return new Date()
  const isTrial = FREE_PLANS.includes(plan)
  return isTrial ? getTrialEndDateFromNow() : undefined
}

export function createSubscription(
  {
    workspace,
    plan,
    createdAt,
    createWithTrialExpired = false,
  }: {
    workspace: Workspace
    plan: SubscriptionPlan
    createdAt?: Date
    createWithTrialExpired?: boolean
  },
  transaction = new Transaction(),
) {
  const trialEndsAt = getTrialEndDate({ createWithTrialExpired, plan })

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
