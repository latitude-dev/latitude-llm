import {
  GrantSource,
  QuotaType,
  Subscription,
  SubscriptionPlans,
  Workspace,
} from '../../browser'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { SubscriptionPlan } from '../../plans'
import { issueGrant } from '../grants/issue'
import { revokeGrants } from '../grants/revoke'

export async function issueSubscriptionGrants(
  {
    subscription,
    workspace,
  }: {
    subscription: Subscription
    workspace: Workspace
  },
  tx = new Transaction(),
) {
  const plan =
    SubscriptionPlans[subscription.plan] ??
    SubscriptionPlans[SubscriptionPlan.HobbyV2]

  return await tx.call(async () => {
    const revoking = await revokeGrants(
      { source: GrantSource.Subscription, workspace },
      tx,
    )
    if (!Result.isOk(revoking)) {
      return Result.error(revoking.error)
    }

    const grantingSeats = await issueGrant(
      {
        type: QuotaType.Seats,
        amount: plan.users,
        source: GrantSource.Subscription,
        referenceId: subscription.id.toString(),
        workspace: workspace,
      },
      tx,
    )
    if (!Result.isOk(grantingSeats)) {
      return Result.error(grantingSeats.error)
    }
    const seats = grantingSeats.unwrap()

    const grantingRuns = await issueGrant(
      {
        type: QuotaType.Runs,
        amount: plan.credits,
        source: GrantSource.Subscription,
        referenceId: subscription.id.toString(),
        workspace: workspace,
      },
      tx,
    )
    if (!Result.isOk(grantingRuns)) {
      return Result.error(grantingRuns.error)
    }
    const runs = grantingRuns.unwrap()

    const grantingCredits = await issueGrant(
      {
        type: QuotaType.Credits,
        amount: plan.latte_credits,
        source: GrantSource.Subscription,
        referenceId: subscription.id.toString(),
        workspace: workspace,
      },
      tx,
    )
    if (!Result.isOk(grantingCredits)) {
      return Result.error(grantingCredits.error)
    }
    const credits = grantingCredits.unwrap()

    return Result.ok({ seats, runs, credits })
  })
}
