import { count, eq, inArray } from 'drizzle-orm'
import Redis from 'ioredis'
import { Subscription, Workspace, WorkspaceUsage } from '../../browser'
import { cache } from '../../cache'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import { PromisedResult } from '../../lib/Transaction'
import { SubscriptionPlan, SubscriptionPlans } from '../../plans'
import {
  ClaimedRewardsRepository,
  EvaluationResultsV2Repository,
  MembershipsRepository,
} from '../../repositories'
import { commits, documentLogs, projects } from '../../schema'
import { getLatestRenewalDate } from './utils/calculateRenewalDate'

/**
 * Handle both old cache format (object) and new cache format (number)
 **/
async function getUsageFromCache(
  cacheClient: Redis,
  cacheKey: string,
): Promise<number | null> {
  const cachedUsage = await cacheClient.get(cacheKey)
  if (cachedUsage === undefined || cachedUsage === null) return null

  const parsedNumber = parseInt(cachedUsage)

  if (!isNaN(parsedNumber)) return parsedNumber

  // If not a number, try to parse as JSON (old cache format)
  try {
    const parsed = JSON.parse(cachedUsage)
    if (typeof parsed === 'object' && parsed.usage !== undefined) {
      return parsed.usage
    }

    return null
  } catch {
    return null
  }
}

async function computeUsageFromDatabase(
  workspace: {
    id: Workspace['id']
    currentSubscriptionCreatedAt: Subscription['createdAt']
  },
  db = database,
): Promise<number> {
  const createdAtDate = workspace.currentSubscriptionCreatedAt
  const targetDate = new Date(Date.now())
  const latestRenewalDate = getLatestRenewalDate(createdAtDate, targetDate)
  const evaluationResultsV2Scope = new EvaluationResultsV2Repository(
    workspace.id,
    db,
  )

  const commitIds = await db
    .select({ commitId: commits.id })
    .from(commits)
    .innerJoin(projects, eq(projects.id, commits.projectId))
    .where(eq(projects.workspaceId, workspace.id))
    .then((r) => r.map((r) => r.commitId))

  const documentLogsCount = await db
    .select({ count: count() })
    .from(documentLogs)
    .where(inArray(documentLogs.commitId, commitIds))
    .then((r) => r[0]!.count)

  const evaluationResultsV2Count = await evaluationResultsV2Scope
    .countSinceDate(latestRenewalDate)
    .then((r) => r.unwrap())

  return evaluationResultsV2Count + documentLogsCount
}

export async function computeWorkspaceUsage(
  workspace: {
    id: Workspace['id']
    currentSubscriptionCreatedAt: Subscription['createdAt']
    plan: SubscriptionPlan
  },
  db = database,
): PromisedResult<WorkspaceUsage, Error> {
  const cacheClient = await cache()
  const cacheKey = `workspace-usage-${workspace.id}`
  let usage = await getUsageFromCache(cacheClient, cacheKey)

  if (usage === null) {
    usage = await computeUsageFromDatabase(workspace, db)
    await cacheClient.set(cacheKey, usage.toString(), 'EX', 86400) // cache for 24 hours
  }

  const claimedRewardsScope = new ClaimedRewardsRepository(workspace.id, db)
  const extraRuns = await claimedRewardsScope
    .getExtraRunsOptimistic()
    .then((r) => r.unwrap())
  const currentSubscriptionPlan = SubscriptionPlans[workspace.plan]

  const membersRepo = new MembershipsRepository(workspace.id, db)
  const members = await membersRepo.findAll().then((r) => r.unwrap())
  const usageResult: WorkspaceUsage = {
    usage,
    // TODO(grants): use grants table instead of this
    max: currentSubscriptionPlan.credits + extraRuns,
    members: members.length,
    maxMembers: currentSubscriptionPlan.users,
  }

  return Result.ok(usageResult)
}
