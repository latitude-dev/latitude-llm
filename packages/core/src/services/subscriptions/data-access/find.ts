import { addMonths } from 'date-fns'
import { Workspace } from '../../../browser'
import { UnprocessableEntityError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { SubscriptionRepository } from '../../../repositories'
import { getLatestRenewalDate } from '../../workspaces/utils/calculateRenewalDate'
import { database } from '../../../client'

export async function findWorkspaceSubscription(
  {
    workspace,
  }: {
    workspace: Workspace
  },
  db = database,
) {
  if (!workspace.currentSubscriptionId) {
    return Result.error(
      new UnprocessableEntityError('Workspace has no subscription'),
    )
  }

  const repository = new SubscriptionRepository(workspace.id, db)
  const finding = await repository.find(workspace.currentSubscriptionId)
  if (finding.error) return Result.error(finding.error)

  const subscription = finding.value
  const billableFrom = getLatestRenewalDate(subscription.createdAt, new Date())
  const billableAt = addMonths(billableFrom, 1)

  return Result.ok({ ...subscription, billableFrom, billableAt })
}
