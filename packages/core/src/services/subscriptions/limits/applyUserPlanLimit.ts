import { PaymentRequiredError } from '@latitude-data/constants/errors'
import { QuotaType, Workspace } from '../../../browser'
import { findWorkspaceUsers } from '../../workspaces/findUsers'
import { Result } from '../../../lib/Result'
import { findWorkspaceSubscription } from '../data-access/find'
import { computeQuota } from '../../grants/quota'

export async function applyUserPlanLimit({
  workspace,
}: {
  workspace: Workspace
}) {
  const subscription = await findWorkspaceSubscription({ workspace }).then(
    (r) => r.value,
  )
  // should not be possible but we are nice and opt for letting the request
  // continue...
  if (!subscription) return Result.nil()

  const result = await findWorkspaceUsers(workspace)
  if (result.error) return result

  const users = result.unwrap()
  const quota = await computeQuota({ type: QuotaType.Seats, workspace }).then(
    (r) => r.value,
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
