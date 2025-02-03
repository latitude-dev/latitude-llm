import { WorkspaceDto, WorkspaceUsage } from '../../browser'
import { database } from '../../client'
import { PromisedResult, Result } from '../../lib'
import { SubscriptionPlans } from '../../plans'
import {
  ClaimedRewardsRepository,
  EvaluationResultsRepository,
} from '../../repositories'
import { DocumentLogsRepository } from '../../repositories/documentLogsRepository'
import { getLatestRenewalDate } from './utils/calculateRenewalDate'

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
  const targetDate = new Date(Date.now())
  const latestRenewalDate = getLatestRenewalDate(createdAtDate, targetDate)

  const evaluationResultsCount =
    await evaluationResultsScope.totalCountSinceDate(latestRenewalDate)

  const documentLogsCount =
    await documentLogsScope.totalCountSinceDate(latestRenewalDate)

  const claimedRewardsScope = new ClaimedRewardsRepository(workspace.id, db)
  const extraRuns = await claimedRewardsScope
    .getExtraRunsOptimistic()
    .then((r) => r.unwrap())

  const currentSubscriptionPlan =
    SubscriptionPlans[workspace.currentSubscription.plan]

  return Result.ok({
    usage: evaluationResultsCount + documentLogsCount,
    max: currentSubscriptionPlan.credits + extraRuns,
  })
}
