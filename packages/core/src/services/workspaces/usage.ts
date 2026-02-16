import { and, count, eq, gte, inArray } from 'drizzle-orm'
import Redis from 'ioredis'
import { MAIN_SPAN_TYPES, QuotaType, WorkspaceUsage } from '../../constants'
import { type Subscription } from '../../schema/models/types/Subscription'
import {
  WorkspaceDto,
  type Workspace,
} from '../../schema/models/types/Workspace'
import { FREE_PLANS, SubscriptionPlan } from '../../plans'
import { cache, getOrSet } from '../../cache'
import { database } from '../../client'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { BadRequestError, PaymentRequiredError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { PromisedResult } from '../../lib/Transaction'
import {
  EvaluationResultsV2Repository,
  MembershipsRepository,
} from '../../repositories'
import { computeQuota } from '../grants/quota'
import { getLatestRenewalDate } from './utils/calculateRenewalDate'
import { spans } from '../../schema/models/spans'
import { isClickHouseSpansReadEnabled } from '../workspaceFeatures/isClickHouseSpansReadEnabled'
import { countMainTypesSince } from '../../queries/clickhouse/spans/countMainTypesSince'

/**
 * Handle both old cache format (object) and new cache format (number)
 **/
export async function getUsageFromCache(
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

  const shouldUseClickHouse = await isClickHouseSpansReadEnabled(
    workspace.id,
    db,
  )

  const spansCount = shouldUseClickHouse
    ? await countMainTypesSince({
        workspaceId: workspace.id,
        since: latestRenewalDate,
      })
    : await db
        .select({ count: count() })
        .from(spans)
        .where(
          and(
            inArray(spans.type, Array.from(MAIN_SPAN_TYPES)),
            eq(spans.workspaceId, workspace.id),
            gte(spans.startedAt, latestRenewalDate),
          ),
        )
        .then((r) => r[0]!.count)

  const evaluationResultsV2Count = await evaluationResultsV2Scope
    .countSinceDate(latestRenewalDate)
    .then((r) => r.unwrap())

  return evaluationResultsV2Count + spansCount
}

export async function computeWorkspaceUsage(
  workspace:
    | {
        id: Workspace['id']
        currentSubscriptionCreatedAt: Subscription['createdAt']
        plan: SubscriptionPlan
      }
    | Workspace,
  db = database,
): PromisedResult<WorkspaceUsage, Error> {
  const cacheClient = await cache()
  const cacheKey = `workspace-usage-${workspace.id}`
  let usage = await getUsageFromCache(cacheClient, cacheKey)
  if (usage === null) {
    usage = await computeUsageFromDatabase(workspace as any, db)
    await cacheClient.set(cacheKey, usage.toString(), 'EX', 86400) // cache for 24 hours
  }

  workspace = await unsafelyFindWorkspace(workspace.id, db)
  if (!workspace) {
    return Result.error(new BadRequestError('Workspace not found'))
  }

  const runs = await computeQuota({ type: QuotaType.Runs, workspace }).then(
    (r) => r.unwrap(),
  )
  const seats = await computeQuota({ type: QuotaType.Seats, workspace }).then(
    (r) => r.unwrap(),
  )

  const membersRepo = new MembershipsRepository(workspace.id, db)
  const members = await membersRepo.findAll().then((r) => r.unwrap())
  const usageResult: WorkspaceUsage = {
    usage,
    max: runs.limit,
    members: members.length,
    maxMembers: seats.limit,
  }

  return Result.ok(usageResult)
}

export async function assertUsageWithinPlanLimits(
  workspace: WorkspaceDto,
  db = database,
): PromisedResult<void, Error> {
  if (!FREE_PLANS.includes(workspace.currentSubscription.plan)) {
    return Result.nil() // Paid plans do not get enforced limits because we charge runs with credit packages
  }

  const cacheClient = await cache()
  const cacheKey = `workspace-usage-${workspace.id}`
  const usage = await getUsageFromCache(cacheClient, cacheKey)
  if (usage === null) return Result.ok(undefined)

  const quotaCacheKey = `workspace-quota-runs-${workspace.id}`
  const runs = await getOrSet(
    quotaCacheKey,
    async () => {
      return await computeQuota({ type: QuotaType.Runs, workspace }, db).then(
        (r) => r.unwrap(),
      )
    },
    3600, // 1 hour
  )
  runs.resetsAt = new Date(runs.resetsAt)
  if (runs.limit === 'unlimited') return Result.nil()
  if (usage >= runs.limit) {
    return Result.error(
      new PaymentRequiredError(
        'You have reached the maximum number of runs allowed for your Latitude plan. Upgrade now.',
      ),
    )
  }

  return Result.nil()
}
