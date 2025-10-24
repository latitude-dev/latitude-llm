import { GrantSource, QuotaType } from '../../constants'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { SubscriptionPlan, SubscriptionPlans } from '../../plans'
import { type Subscription } from '../../schema/models/types/Subscription'
import { type Workspace } from '../../schema/models/types/Workspace'
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
    SubscriptionPlans[SubscriptionPlan.HobbyV3]

  return await tx.call(async () => {
    const revoking = await revokeGrants(
      { source: GrantSource.Subscription, workspace },
      tx,
    )
    if (revoking.error) {
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
    if (grantingSeats.error) {
      return Result.error(grantingSeats.error)
    }
    const seats = grantingSeats.value

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
    if (grantingRuns.error) {
      return Result.error(grantingRuns.error)
    }
    const runs = grantingRuns.value

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
    if (grantingCredits.error) {
      return Result.error(grantingCredits.error)
    }
    const credits = grantingCredits.value

    return Result.ok({ seats, runs, credits })
  })
}
