import { addMonths } from 'date-fns'
import {
  SubscriptionPlan,
  SubscriptionPlanContent,
  SubscriptionPlans,
  Workspace,
} from '../../browser'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { SubscriptionRepository } from '../../repositories'
import { getLatestRenewalDate } from '../workspaces/utils/calculateRenewalDate'

export async function getWorkspaceSubscription(
  {
    workspace,
  }: {
    workspace: Workspace
  },
  tx = new Transaction(),
) {
  return await tx.call(async (db) => {
    if (!workspace.currentSubscriptionId) {
      return Result.error(
        new UnprocessableEntityError('Workspace has no subscription'),
      )
    }

    const repository = new SubscriptionRepository(workspace.id, db)
    const finding = await repository.find(workspace.currentSubscriptionId)
    if (finding.error) {
      return Result.error(finding.error)
    }
    const subscription = finding.value

    let plan: SubscriptionPlanContent = {
      plan: SubscriptionPlan.HobbyV2,
      ...SubscriptionPlans[SubscriptionPlan.HobbyV2],
    }
    if (subscription.plan in SubscriptionPlans) {
      plan = {
        plan: subscription.plan,
        ...SubscriptionPlans[subscription.plan],
      }
    }

    const billableFrom = getLatestRenewalDate(
      subscription.createdAt,
      new Date(),
    )
    const billableAt = addMonths(billableFrom, 1)

    return Result.ok({ ...subscription, plan, billableFrom, billableAt })
  })
}
