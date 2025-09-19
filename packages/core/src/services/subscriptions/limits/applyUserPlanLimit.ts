import { PaymentRequiredError } from '@latitude-data/constants/errors'
import {
  FREE_PLANS,
  PRO_PLANS,
  QuotaType,
  Subscription,
  Workspace,
} from '../../../browser'
import { findWorkspaceUsers } from '../../workspaces/findUsers'
import { Result } from '../../../lib/Result'
import { findWorkspaceSubscription } from '../data-access/find'
import { computeQuota } from '../../grants/quota'

export async function applyUserPlanLimit({
  workspace,
}: {
  workspace: Workspace & { currentSubscription: Subscription }
}) {
  const subscription =
    workspace.currentSubscription ??
    (await findWorkspaceSubscription({ workspace }).then((r) => r.value))

  // should not be possible but we are nice and opt for letting the request continue...
  if (!subscription) return Result.nil()
  // Team and enterprise plans don't have this limit as they are charged per seat
  if (![...FREE_PLANS, ...PRO_PLANS].includes(subscription.plan)) return Result.nil() // prettier-ignore

  const result = await findWorkspaceUsers(workspace)
  if (!Result.isOk(result)) return result

  const users = result.unwrap()
  const quota = await computeQuota({ type: QuotaType.Seats, workspace }).then(
    (r) => r.unwrap(),
  )

  // should not be possible but we are nice and opt for letting the request continue...
  if (!quota) return Result.nil()
  if (quota.limit === 'unlimited') return Result.nil()
  if (users.length >= Number(quota.limit)) {
    return Result.error(
      new PaymentRequiredError(
        `You have reached the maximum number of users allowed for this plan. Upgrade now.`,
      ),
    )
  }

  return Result.nil()
}
