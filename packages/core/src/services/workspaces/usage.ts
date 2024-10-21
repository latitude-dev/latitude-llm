import { WorkspaceDto, WorkspaceUsage } from '../../browser'
import { database } from '../../client'
import { PromisedResult, Result } from '../../lib'
import { SubscriptionPlans } from '../../plans'
import {
  ClaimedRewardsRepository,
  EvaluationResultsRepository,
} from '../../repositories'
import { DocumentLogsRepository } from '../../repositories/documentLogsRepository'

export function getLatestRenewalDate(firstRenewalDate: Date, targetDate: Date) {
  if (targetDate.getTime() < firstRenewalDate.getTime()) {
    return firstRenewalDate
  }

  const day = firstRenewalDate.getDate() // The day of the month is always mantained.

  return new Date(
    targetDate.getFullYear(),
    (targetDate.getMonth() - (targetDate.getDate() < day ? 1 : 0)) % 12,
    day,
  )
}

export async function computeWorkspaceUsage(
  workspace: WorkspaceDto,
  db = database,
): PromisedResult<WorkspaceUsage, Error> {
  const documentLogsScope = new DocumentLogsRepository(workspace.id, db)
  const evaluationResultsScope = new EvaluationResultsRepository(
    workspace.id,
    db,
  )

  const createdAtDate = workspace.currentSubscription.createdAt
  const currentDate = new Date(Date.now())
  const latestRenewalDate = getLatestRenewalDate(createdAtDate, currentDate)

  const evaluationResultsCount =
    await evaluationResultsScope.totalCountSinceDate(latestRenewalDate)

  const documentLogsCount =
    await documentLogsScope.totalCountSinceDate(latestRenewalDate)

  const claimedRewardsScope = new ClaimedRewardsRepository(workspace.id, db)
  const extraRunsResult = await claimedRewardsScope.getExtraRunsOptimistic()
  if (extraRunsResult.error) return Result.error(extraRunsResult.error)

  const currentSubscriptionPlan =
    SubscriptionPlans[workspace.currentSubscription.plan]

  return Result.ok({
    usage: evaluationResultsCount + documentLogsCount,
    max: currentSubscriptionPlan.credits + extraRunsResult.value,
  })
}
