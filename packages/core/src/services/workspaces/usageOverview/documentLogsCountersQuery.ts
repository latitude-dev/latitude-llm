import { sql, eq, and, gte, isNull, max } from 'drizzle-orm'
import { database } from '../../../client'
import {
  commits,
  documentLogs,
  projects,
  runErrors,
  workspaces,
} from '../../../schema'
import { ErrorableEntity } from '../../../constants'
import { type RenewalDatesQuery } from '../utils/calculateRenewalDate'

export function buildDocumentLogsCountersQuery(
  renewalDates: RenewalDatesQuery,
) {
  return database
    .select({
      workspaceId: projects.workspaceId,
      currentPeriodAt: max(renewalDates.currentPeriodAt).as(
        'current_period_at',
      ),
      oneMonthAgoPeriodAt: max(renewalDates.oneMonthAgoPeriodAt).as(
        'one_month_ago_period_at',
      ),
      twoMonthsAgoPeriodAt: max(renewalDates.twoMonthsAgoPeriodAt).as(
        'two_months_ago_period_at',
      ),
      lastMonthCount: sql<number>`
        COUNT(
          CASE WHEN "document_logs"."created_at" >= CURRENT_DATE - INTERVAL '1 month'
            THEN 1 ELSE NULL
          END
        )
      `.as('last_month_logs_count'),
      currentPeriodCount: sql<number>`
        COUNT(
          CASE
            WHEN "document_logs"."created_at" >= renewal_dates.current_period_at
              THEN 1 ELSE NULL
          END
        )
      `.as('current_period_logs_count'),
      oneMonthAgoPeriodCount: sql<number>`
        COUNT(
          CASE WHEN "document_logs"."created_at" BETWEEN renewal_dates.one_month_ago_period_at AND renewal_dates.current_period_at
            THEN 1 ELSE NULL
          END
        )
      `.as('one_month_ago_logs_count'),
      twoMonthsAgoPeriodCount: sql<number>`
        COUNT(
          CASE WHEN "document_logs"."created_at" BETWEEN renewal_dates.two_months_ago_period_at AND renewal_dates.one_month_ago_period_at
            THEN 1 ELSE NULL
          END
        )
      `.as('two_months_ago_logs_count'),
    })
    .from(workspaces)
    .innerJoin(
      renewalDates,
      eq(renewalDates.subscriptionId, workspaces.currentSubscriptionId),
    )
    .innerJoin(projects, eq(projects.workspaceId, workspaces.id))
    .leftJoin(commits, eq(commits.projectId, projects.id))
    .leftJoin(documentLogs, eq(documentLogs.commitId, commits.id))
    .leftJoin(
      runErrors,
      and(
        eq(runErrors.errorableUuid, documentLogs.uuid),
        eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
      ),
    )
    .where(
      and(
        isNull(runErrors.id),
        gte(
          documentLogs.createdAt,
          sql<Date>`CURRENT_DATE - INTERVAL '3 months'`,
        ),
      ),
    )
    .groupBy(projects.workspaceId)
    .as('logs_counters')
}
