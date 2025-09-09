import { QuotaType, Workspace } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { GrantsRepository } from '../../repositories'
import { getWorkspaceSubscription } from '../subscriptions/get'

export async function computeQuota(
  {
    type,
    workspace,
  }: {
    type: QuotaType
    workspace: Workspace
  },
  tx = new Transaction(),
) {
  const getting = await getWorkspaceSubscription({ workspace }, tx)
  if (getting.error) {
    return Result.error(getting.error)
  }
  const subscription = getting.value

  const repository = new GrantsRepository(workspace.id)
  const counting = await repository.quotaSinceDate(
    type,
    subscription.billableFrom,
  )
  if (counting.error) {
    return Result.error(counting.error)
  }
  const quota = counting.value

  return Result.ok({
    limit: quota,
    resetsAt: subscription.billableAt,
  })
}
