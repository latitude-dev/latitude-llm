import { desc, sql, eq, max } from 'drizzle-orm'
import { database, Database } from '../../../client'
import { buildDocumentLogsCountersQuery } from './documentLogsCountersQuery'
import { buildEvaluationResultsCountersQuery } from './evaluationResultsCountersQuery'
import { workspaceUsageInfoQuery } from './workspaceUsageInfoQuery'
import { buildSubscriptionWithRenewalDatesQuery } from '../utils/calculateRenewalDate'

/**
 * NOTE:
 * This query is pre-agrragating the data for the overview page.
 * It has a subquery for documentLogs and evaluationResults.
 * I'm aware that this can do full table scans.
 * But without pre-aggregating the data the query results in duplicate rows.
 * so the counts are wrong.
 */
export async function getUsageOverview(
  {
    pageSize,
    page,
    targetDate,
  }: {
    pageSize: number
    page: number
    targetDate?: Date
  },
  db: Database = database,
) {
  const renewalDates = buildSubscriptionWithRenewalDatesQuery(targetDate)
  const documentLogsCountersQuery = buildDocumentLogsCountersQuery(renewalDates)
  const evaluationResultsCountersQuery =
    buildEvaluationResultsCountersQuery(renewalDates)
  const query = db
    .select({
      id: workspaceUsageInfoQuery.id,
      name: max(workspaceUsageInfoQuery.name),
      subscriptionPlan: max(workspaceUsageInfoQuery.subscriptionPlan),
      emails: max(workspaceUsageInfoQuery.emails),
      numOfMembers: max(workspaceUsageInfoQuery.numOfMembers),
      subscriptionCreatedAt: max(workspaceUsageInfoQuery.subscriptionCreatedAt),

      // Last 30 (or 31) natural days generated runs (documentLogs + evaluationResults)
      lastMonthRuns: sql<number>`SUM(
        ${documentLogsCountersQuery.lastMonthCount} +
        ${evaluationResultsCountersQuery.oneMonthCount}
      )`.as('last_month_runs'),

      // Current period (period is when subscription was created)
      currentPeriodAt: max(documentLogsCountersQuery.currentPeriodAt),
      currentPeriodRuns: sql<number>`SUM(
        ${documentLogsCountersQuery.currentPeriodCount} +
        ${evaluationResultsCountersQuery.currentPeriodCount}
      )`.as('current_period_runs'),

      // One month ago period
      oneMonthAgoPeriodAt: max(documentLogsCountersQuery.oneMonthAgoPeriodAt),
      oneMonthAgoPeriodRuns: sql<number>`SUM(
        ${documentLogsCountersQuery.oneMonthAgoPeriodCount} +
        ${evaluationResultsCountersQuery.oneMonthAgoPeriodCount}
      )`.as('one_month_ago_period_runs'),

      // Two months ago period
      twoMonthsAgoPeriodAt: max(documentLogsCountersQuery.twoMonthsAgoPeriodAt),
      twoMonthsAgoPeriodRuns: sql<number>`SUM(
        ${documentLogsCountersQuery.twoMonthsAgoPeriodCount} +
        ${evaluationResultsCountersQuery.twoMonthsAgoPeriodCount}
      )`.as('two_months_ago_period_runs'),
    })
    .from(workspaceUsageInfoQuery)
    .innerJoin(
      documentLogsCountersQuery,
      eq(documentLogsCountersQuery.workspaceId, workspaceUsageInfoQuery.id),
    )
    .innerJoin(
      evaluationResultsCountersQuery,
      eq(
        evaluationResultsCountersQuery.workspaceId,
        workspaceUsageInfoQuery.id,
      ),
    )
    .groupBy(workspaceUsageInfoQuery.id)
    .orderBy(desc(sql<number>`last_month_runs`))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return await query
}

export type GetUsageOverviewRow = Awaited<
  ReturnType<typeof getUsageOverview>
>[number]
export type GetUsageOverview = GetUsageOverviewRow[]
