import { and, eq, gte, inArray, isNull, max, not, sql } from 'drizzle-orm'
import { subMonths } from 'date-fns'
import { database } from '../../../client'
import type { Database } from '../../../client'
import { SpanStatus } from '../../../constants'
import { SubscriptionPlan } from '../../../plans'
import { getUsageOverviewCounts } from '../../../queries/clickhouse/spans/getUsageOverviewCounts'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'
import { features } from '../../../schema/models/features'
import { spans } from '../../../schema/models/spans'
import { workspaceFeatures } from '../../../schema/models/workspaceFeatures'
import { workspaces } from '../../../schema/models/workspaces'
import { CLICKHOUSE_SPANS_READ_FLAG } from '../../workspaceFeatures/flags'
import { workspaceUsageInfoCTE } from './workspaceUsageInfoQuery'

type UsageOverviewBaseRow = {
  workspaceId: number
  name: string | null
  subscriptionPlan: SubscriptionPlan | null
  subscriptionCreatedAt: string | Date | null
  numOfMembers: string | number | null
  emails: string | null
  evaluationLastMonthCount: string | number
  evaluationLastTwoMonthsCount: string | number
  latestEvaluationCreatedAt: string | Date | null
}

type UsageOverviewSpansCount = {
  workspaceId: number
  latestCreatedAt: string | Date | null
  lastMonthCount: number
  lastTwoMonthsCount: number
}

function toUtcDateStart(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
}

function toNumber(value: string | number | null | undefined) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  return 0
}

function toDate(value: string | Date | null | undefined) {
  if (!value) return null
  if (value instanceof Date) return value
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toDateTimeString(value: string | Date | null) {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return typeof value === 'string' ? value : null
  }

  return parsed.toISOString().slice(0, 19).replace('T', ' ')
}

function getLatestDateTime(
  left: string | Date | null,
  right: string | Date | null,
) {
  const leftDate = toDate(left)
  const rightDate = toDate(right)

  if (!leftDate && !rightDate) return null
  if (!leftDate) return toDateTimeString(right)
  if (!rightDate) return toDateTimeString(left)

  return leftDate >= rightDate
    ? toDateTimeString(left)
    : toDateTimeString(right)
}

async function getClickhouseFlagScope(db: Database = database) {
  const feature = await db
    .select({ id: features.id, enabled: features.enabled })
    .from(features)
    .where(eq(features.name, CLICKHOUSE_SPANS_READ_FLAG))
    .limit(1)
    .then((rows) => rows[0])

  if (!feature) {
    return { allEnabled: false, workspaceIds: [] as number[] }
  }

  if (feature.enabled) {
    return { allEnabled: true, workspaceIds: [] as number[] }
  }

  const workspaceIds = await db
    .select({ workspaceId: workspaceFeatures.workspaceId })
    .from(workspaceFeatures)
    .where(
      and(
        eq(workspaceFeatures.featureId, feature.id),
        eq(workspaceFeatures.enabled, true),
      ),
    )
    .then((rows) => rows.map((row) => row.workspaceId))

  return { allEnabled: false, workspaceIds }
}

async function getPostgresUsageOverviewSpansCounts({
  lastMonthBoundary,
  lastTwoMonthsBoundary,
  workspaceIds,
  db = database,
}: {
  lastMonthBoundary: Date
  lastTwoMonthsBoundary: Date
  workspaceIds?: number[]
  db?: Database
}) {
  if (workspaceIds && workspaceIds.length === 0) return []

  const rows = await db
    .select({
      workspaceId: spans.workspaceId,
      latestCreatedAt: max(spans.createdAt).as('latest_span_created_at'),
      lastMonthCount: sql<number>`COUNT(
        CASE WHEN ${spans.createdAt} >= ${lastMonthBoundary} THEN 1 ELSE NULL END
      )`.as('last_month_spans_count'),
      lastTwoMonthsCount: sql<number>`COUNT(
        CASE WHEN ${spans.createdAt} >= ${lastTwoMonthsBoundary}
          AND ${spans.createdAt} < ${lastMonthBoundary}
          THEN 1 ELSE NULL
        END
      )`.as('last_two_months_logs_count'),
    })
    .from(spans)
    .where(
      and(
        not(eq(spans.status, SpanStatus.Error)),
        workspaceIds ? inArray(spans.workspaceId, workspaceIds) : undefined,
      ),
    )
    .groupBy(spans.workspaceId)

  return rows.map((row) => ({
    workspaceId: row.workspaceId,
    latestCreatedAt: row.latestCreatedAt,
    lastMonthCount: toNumber(row.lastMonthCount),
    lastTwoMonthsCount: toNumber(row.lastTwoMonthsCount),
  })) satisfies UsageOverviewSpansCount[]
}

async function getBaseUsageOverviewRows({
  targetDate,
  db = database,
}: {
  targetDate: Date
  db?: Database
}) {
  const targetDateCondition = targetDate
    .toISOString()
    .replace('T', ' ')
    .replace('Z', '')
  const dateCondition = sql<Date>`CAST(${targetDateCondition} AS DATE)`

  const evaluationResultsV2CTE = db.$with('evaluation_results_v2_counts').as(
    db
      .select({
        workspaceId: sql<number>`${evaluationResultsV2.workspaceId}`.as(
          'evaluation_result_v2_workspace_id',
        ),
        latestCreatedAt: max(evaluationResultsV2.createdAt).as(
          'latest_evaluation_result_v2_created_at',
        ),
        lastMonthCount: sql<number>`COUNT(
          CASE WHEN ${evaluationResultsV2.createdAt} >= ${dateCondition} - INTERVAL '1 month'
            THEN 1 ELSE NULL
          END
        )`.as('last_month_evaluation_results_v2_count'),
        lastTwoMonthsCount: sql<number>`COUNT(
          CASE WHEN ${evaluationResultsV2.createdAt} >= ${dateCondition} - INTERVAL '2 months'
            AND ${evaluationResultsV2.createdAt} < ${dateCondition} - INTERVAL '1 month'
            THEN 1 ELSE NULL
          END
        )`.as('last_two_months_evaluation_results_v2_count'),
      })
      .from(evaluationResultsV2)
      .where(
        and(
          isNull(evaluationResultsV2.error),
          gte(
            evaluationResultsV2.createdAt,
            sql<Date>`${dateCondition} - INTERVAL '2 months'`,
          ),
        ),
      )
      .groupBy(evaluationResultsV2.workspaceId),
  )

  return db
    .with(workspaceUsageInfoCTE, evaluationResultsV2CTE)
    .select({
      workspaceId: workspaces.id,
      name: workspaces.name,
      subscriptionPlan: workspaceUsageInfoCTE.subscriptionPlan,
      subscriptionCreatedAt: workspaceUsageInfoCTE.subscriptionCreatedAt,
      numOfMembers: workspaceUsageInfoCTE.numOfMembers,
      emails: workspaceUsageInfoCTE.emails,
      evaluationLastMonthCount: sql<number>`COALESCE(${evaluationResultsV2CTE.lastMonthCount}, 0)`,
      evaluationLastTwoMonthsCount: sql<number>`COALESCE(${evaluationResultsV2CTE.lastTwoMonthsCount}, 0)`,
      latestEvaluationCreatedAt: evaluationResultsV2CTE.latestCreatedAt,
    })
    .from(workspaces)
    .leftJoin(
      workspaceUsageInfoCTE,
      eq(workspaceUsageInfoCTE.id, workspaces.id),
    )
    .leftJoin(
      evaluationResultsV2CTE,
      eq(evaluationResultsV2CTE.workspaceId, workspaces.id),
    ) as Promise<UsageOverviewBaseRow[]>
}

/**
 * Retrieves workspace usage overview data with pagination support.
 *
 * This complex query aggregates workspace usage metrics including:
 * - Basic workspace info (ID, name, subscription plan, member count, emails)
 * - Activity metrics (last month and last two months trace counts)
 * - Latest activity timestamp across spans and evaluation results
 *
 * The query uses CTEs (Common Table Expressions) to:
 * 1. Count successful spans from the last 2 months (excluding errors)
 * 2. Count successful evaluation results from the last 2 months (excluding errors)
 * 3. Combine with workspace usage info and aggregate totals
 *
 * Results are ordered by activity level (last month traces desc) and member count,
 * then paginated based on provided page/size parameters.
 *
 * @param page - Page number for pagination (1-based)
 * @param pageSize - Number of results per page
 * @param targetDate - Optional date to calculate relative time periods (defaults to current date)
 * @param db - Optional database client (defaults to main database)
 * @returns Promise resolving to array of workspace usage overview rows
 */
export async function getUsageOverview(
  {
    page,
    pageSize,
    targetDate: target,
  }: {
    pageSize: number
    page: number
    targetDate?: Date
  },
  db = database,
) {
  const targetDate = toUtcDateStart(target ?? new Date())
  const lastMonthBoundary = subMonths(targetDate, 1)
  const lastTwoMonthsBoundary = subMonths(targetDate, 2)

  const baseRows = await getBaseUsageOverviewRows({
    targetDate,
    db,
  })

  const allWorkspaceIds = baseRows.map((row) => row.workspaceId)
  const clickhouseFlagScope = await getClickhouseFlagScope(db)
  const clickhouseWorkspaceIds = clickhouseFlagScope.allEnabled
    ? allWorkspaceIds
    : allWorkspaceIds.filter((workspaceId) =>
        clickhouseFlagScope.workspaceIds.includes(workspaceId),
      )
  const postgresWorkspaceIds = allWorkspaceIds.filter(
    (workspaceId) => !clickhouseWorkspaceIds.includes(workspaceId),
  )

  const [clickhouseSpansCounts, postgresSpansCounts] = await Promise.all([
    getUsageOverviewCounts({
      lastMonthBoundary,
      lastTwoMonthsBoundary,
      workspaceIds: clickhouseWorkspaceIds,
    }),
    getPostgresUsageOverviewSpansCounts({
      lastMonthBoundary,
      lastTwoMonthsBoundary,
      workspaceIds: postgresWorkspaceIds,
      db,
    }),
  ])

  const spansByWorkspace = new Map<number, UsageOverviewSpansCount>()
  for (const row of [...clickhouseSpansCounts, ...postgresSpansCounts]) {
    spansByWorkspace.set(row.workspaceId, row)
  }

  const rows = baseRows
    .map((row) => {
      const spansUsage = spansByWorkspace.get(row.workspaceId)
      const lastMonthRuns =
        (spansUsage?.lastMonthCount ?? 0) +
        toNumber(row.evaluationLastMonthCount)
      const lastTwoMonthsRuns =
        (spansUsage?.lastTwoMonthsCount ?? 0) +
        toNumber(row.evaluationLastTwoMonthsCount)

      return {
        workspaceId: row.workspaceId,
        name: row.name,
        subscriptionPlan: row.subscriptionPlan ?? undefined,
        subscriptionCreatedAt: toDateTimeString(row.subscriptionCreatedAt),
        numOfMembers:
          row.numOfMembers === null ? null : toNumber(row.numOfMembers),
        emails: row.emails,
        lastMonthRuns,
        lastTwoMonthsRuns,
        latestRunAt: getLatestDateTime(
          spansUsage?.latestCreatedAt ?? null,
          row.latestEvaluationCreatedAt,
        ),
      }
    })
    .sort((left, right) => {
      const runsDelta = Number(right.lastMonthRuns) - Number(left.lastMonthRuns)
      if (runsDelta !== 0) return runsDelta

      return toNumber(right.numOfMembers) - toNumber(left.numOfMembers)
    })

  return rows.slice((page - 1) * pageSize, page * pageSize)
}

export type GetUsageOverviewRow = Awaited<
  ReturnType<typeof getUsageOverview>
>[number]
export type GetUsageOverview = GetUsageOverviewRow[]
