import { Subscription, Workspace, WorkspaceUsage } from '../../browser'
import { database } from '../../client'
import { SubscriptionPlan, SubscriptionPlans } from '../../plans'
import {
  ClaimedRewardsRepository,
  EvaluationResultsRepository,
  EvaluationResultsV2Repository,
  MembershipsRepository,
} from '../../repositories'
import { DocumentLogsRepository } from '../../repositories/documentLogsRepository'
import { getLatestRenewalDate } from './utils/calculateRenewalDate'
import { PromisedResult } from './../../lib/Transaction'
import { Result } from './../../lib/Result'

export async function computeWorkspaceUsage(
  workspace: {
    id: Workspace['id']
    currentSubscriptionCreatedAt: Subscription['createdAt']
    plan: SubscriptionPlan
  },
  db = database,
): PromisedResult<WorkspaceUsage, Error> {
  const documentLogsScope = new DocumentLogsRepository(workspace.id, db)
  const evaluationResultsScope = new EvaluationResultsRepository(
    workspace.id,
    db,
  )
  const evaluationResultsV2Scope = new EvaluationResultsV2Repository(
    workspace.id,
    db,
  )

  const createdAtDate = workspace.currentSubscriptionCreatedAt
  const targetDate = new Date(Date.now())
  const latestRenewalDate = getLatestRenewalDate(createdAtDate, targetDate)

  const documentLogsCount =
    await documentLogsScope.totalCountSinceDate(latestRenewalDate)

  const claimedRewardsScope = new ClaimedRewardsRepository(workspace.id, db)
  const extraRuns = await claimedRewardsScope
    .getExtraRunsOptimistic()
    .then((r) => r.unwrap())

  const currentSubscriptionPlan = SubscriptionPlans[workspace.plan]

  const evaluationResultsCount =
    await evaluationResultsScope.totalCountSinceDate(latestRenewalDate)

  const evaluationResultsV2Count = await evaluationResultsV2Scope
    .countSinceDate(latestRenewalDate)
    .then((r) => r.unwrap())

  const membersRepo = new MembershipsRepository(workspace.id, db)
  const members = await membersRepo.findAll().then((r) => r.unwrap())

  return Result.ok({
    usage:
      evaluationResultsCount + evaluationResultsV2Count + documentLogsCount,
    max: currentSubscriptionPlan.credits + extraRuns,
    members: members.length,
    maxMembers: currentSubscriptionPlan.users,
  })
}
