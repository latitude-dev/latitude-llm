import { Subscription, Workspace, WorkspaceUsage } from '../../browser'
import { database } from '../../client'
import { SubscriptionPlan, SubscriptionPlans } from '../../plans'
import {
  ClaimedRewardsRepository,
  EvaluationResultsV2Repository,
  MembershipsRepository,
} from '../../repositories'
import { getLatestRenewalDate } from './utils/calculateRenewalDate'
import { PromisedResult } from './../../lib/Transaction'
import { Result } from './../../lib/Result'
import { commits, documentLogs, projects } from '../../schema'
import { count, eq, inArray } from 'drizzle-orm'

export async function computeWorkspaceUsage(
  workspace: {
    id: Workspace['id']
    currentSubscriptionCreatedAt: Subscription['createdAt']
    plan: SubscriptionPlan
  },
  db = database,
): PromisedResult<WorkspaceUsage, Error> {
  const createdAtDate = workspace.currentSubscriptionCreatedAt
  const targetDate = new Date(Date.now())
  const latestRenewalDate = getLatestRenewalDate(createdAtDate, targetDate)
  const evaluationResultsV2Scope = new EvaluationResultsV2Repository(
    workspace.id,
    db,
  )

  const commitIds = await db
    .select({ commitId: documentLogs.commitId })
    .from(commits)
    .innerJoin(projects, eq(projects.id, commits.projectId))
    .then((r) => r.map((r) => r.commitId))

  const documentLogsCount = await db
    .select({ count: count() })
    .from(documentLogs)
    .where(inArray(documentLogs.commitId, commitIds))
    .then((r) => r[0]!.count)

  const claimedRewardsScope = new ClaimedRewardsRepository(workspace.id, db)
  const extraRuns = await claimedRewardsScope
    .getExtraRunsOptimistic()
    .then((r) => r.unwrap())
  const currentSubscriptionPlan = SubscriptionPlans[workspace.plan]
  const evaluationResultsV2Count = await evaluationResultsV2Scope
    .countSinceDate(latestRenewalDate)
    .then((r) => r.unwrap())

  const membersRepo = new MembershipsRepository(workspace.id, db)
  const members = await membersRepo.findAll().then((r) => r.unwrap())

  return Result.ok({
    usage: evaluationResultsV2Count + documentLogsCount,
    max: currentSubscriptionPlan.credits + extraRuns,
    members: members.length,
    maxMembers: currentSubscriptionPlan.users,
  })
}
