import { database } from '../../client'
import { QuotaType } from '../../constants'
import { Result } from '../../lib/Result'
import { GrantsRepository } from '../../repositories'
import { type Workspace } from '../../schema/models/types/Workspace'
import { findWorkspaceSubscription } from '../subscriptions/data-access/find'

export async function computeQuota(
  {
    type,
    workspace,
  }: {
    type: QuotaType
    workspace: Workspace
  },
  db = database,
) {
  const getting = await findWorkspaceSubscription({ workspace }, db)
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
