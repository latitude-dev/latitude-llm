import { and, desc, eq, gte, inArray, isNull, max, sql } from 'drizzle-orm'
import { database } from '../../../client'
import { MAIN_SPAN_TYPES } from '../../../constants'
import { SubscriptionPlan } from '../../../plans'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'
import { workspaces } from '../../../schema/models/workspaces'
import { workspaceUsageInfoCTE } from './workspaceUsageInfoQuery'
import { spans } from '../../../schema/models/spans'

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
  const targetDate =
    target?.toISOString().replace('T', ' ').replace('Z', '') ?? undefined
  const dateCondition = targetDate
    ? sql<Date>`CAST(${targetDate} AS DATE)`
    : sql<Date>`CURRENT_DATE`
  const spansCTE = db.$with('document_logs_counts').as(
    db
      .select({
        workspaceId: sql<number>`${spans.workspaceId}`.as('span_workspace_id'),
        latestCreatedAt: max(spans.createdAt).as('latest_span_created_at'),
        lastMonthCount: sql<number>`
          COUNT(
            CASE WHEN ${spans.createdAt} >= ${dateCondition} - INTERVAL '1 month'
              THEN 1 ELSE NULL
            END
          )
        `.as('last_month_spans_count'),
        lastTwoMonthsCount: sql<number>`
          COUNT(
            CASE WHEN ${spans.createdAt} >= ${dateCondition} - INTERVAL '2 months'
              AND ${spans.createdAt} < ${dateCondition} - INTERVAL '1 month'
              THEN 1 ELSE NULL
            END
          )
        `.as('last_two_months_logs_count'),
      })
      .from(spans)
      .where(and(inArray(spans.type, Array.from(MAIN_SPAN_TYPES))))
      .groupBy(spans.workspaceId),
  )

  const evaluationResultsV2CTE = db.$with('evaluation_results_v2_counts').as(
    db
      .select({
        workspaceId: sql<number>`${evaluationResultsV2.workspaceId}`.as(
          'evaluation_result_v2_workspace_id',
        ),
        latestCreatedAt: max(evaluationResultsV2.createdAt).as(
          'latest_evaluation_result_v2_created_at',
        ),
        lastMonthCount: sql<number>`
          COUNT(
            CASE WHEN ${evaluationResultsV2.createdAt} >= ${dateCondition} - INTERVAL '1 month'
              THEN 1 ELSE NULL
            END
          )
        `.as('last_month_evaluation_results_v2_count'),
        lastTwoMonthsCount: sql<number>`
          COUNT(
            CASE WHEN ${evaluationResultsV2.createdAt} >= ${dateCondition} - INTERVAL '2 months'
              AND ${evaluationResultsV2.createdAt} < ${dateCondition} - INTERVAL '1 month'
              THEN 1 ELSE NULL
            END
          )
        `.as('last_two_months_evaluation_results_v2_count'),
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

  const query = db
    .with(spansCTE, workspaceUsageInfoCTE, evaluationResultsV2CTE)
    .select({
      workspaceId: max(workspaces.id),
      name: max(workspaces.name),
      subscriptionPlan: sql<SubscriptionPlan>`MAX(${workspaceUsageInfoCTE.subscriptionPlan})`,
      subscriptionCreatedAt: max(
        workspaceUsageInfoCTE.subscriptionCreatedAt,
      ).as('subscription_created_at'),
      numOfMembers: max(workspaceUsageInfoCTE.numOfMembers).as(
        'num_of_members',
      ),
      emails: max(workspaceUsageInfoCTE.emails),
      lastMonthTraces: sql<number>`SUM(
        COALESCE(${spansCTE.lastMonthCount}, 0) +
        COALESCE(${evaluationResultsV2CTE.lastMonthCount}, 0)
      )`.as('last_month_traces'),
      lastTwoMonthsTraces: sql<number>`SUM(
        COALESCE(${spansCTE.lastTwoMonthsCount}, 0) +
        COALESCE(${evaluationResultsV2CTE.lastTwoMonthsCount}, 0)
      )`.as('last_two_months_traces'),
      latestTraceAt: sql<Date | string>`GREATEST(
        ${spansCTE.latestCreatedAt},
        ${evaluationResultsV2CTE.latestCreatedAt}
      )`.as('latest_trace_at'),
    })
    .from(workspaces)
    .leftJoin(
      workspaceUsageInfoCTE,
      eq(workspaceUsageInfoCTE.id, workspaces.id),
    )
    .leftJoin(spansCTE, eq(spansCTE.workspaceId, workspaces.id))
    .leftJoin(
      evaluationResultsV2CTE,
      eq(evaluationResultsV2CTE.workspaceId, workspaces.id),
    )
    .groupBy(workspaces.id, sql`latest_trace_at`)
    .orderBy(
      desc(sql<number>`last_month_traces`),
      desc(sql<number>`num_of_members`),
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return query
}

export type GetUsageOverviewRow = Awaited<
  ReturnType<typeof getUsageOverview>
>[number]
export type GetUsageOverview = GetUsageOverviewRow[]
