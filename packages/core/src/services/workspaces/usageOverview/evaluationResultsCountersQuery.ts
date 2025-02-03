import { sql, eq, and, gte, isNull } from 'drizzle-orm'
import { database } from '../../../client'
import {
  evaluationResults,
  evaluations,
  runErrors,
  workspaces,
} from '../../../schema'
import { ErrorableEntity } from '../../../constants'
import { type RenewalDatesQuery } from '../utils/calculateRenewalDate'

export function buildEvaluationResultsCountersQuery(
  renewalDates: RenewalDatesQuery,
) {
  return database
    .select({
      workspaceId: evaluations.workspaceId,
      oneMonthCount: sql<number>`
        COUNT(
          CASE WHEN "evaluation_results"."created_at" >= CURRENT_DATE - INTERVAL '1 month'
            THEN 1 ELSE NULL
          END
        )
      `.as('last_month_evaluation_results_count'),
      currentPeriodCount: sql<number>`
        COUNT(
          CASE
            WHEN "evaluation_results"."created_at" >= renewal_dates.current_period_at
              THEN 1 ELSE NULL
          END
        )
      `.as('current_period_evaluation_results_count'),
      oneMonthAgoPeriodCount: sql<number>`
        COUNT(
          CASE WHEN "evaluation_results"."created_at" BETWEEN renewal_dates.one_month_ago_period_at AND renewal_dates.current_period_at
            THEN 1 ELSE NULL
          END
        )
      `.as('one_month_ago_evaluation_results_count'),
      twoMonthsAgoPeriodCount: sql<number>`
        COUNT(
          CASE WHEN "evaluation_results"."created_at" BETWEEN renewal_dates.two_months_ago_period_at AND renewal_dates.one_month_ago_period_at
            THEN 1 ELSE NULL
          END
        )
      `.as('two_months_ago_evaluation_results_count'),
    })
    .from(workspaces)
    .innerJoin(
      renewalDates,
      eq(renewalDates.subscriptionId, workspaces.currentSubscriptionId),
    )
    .leftJoin(evaluations, eq(evaluations.workspaceId, workspaces.id))
    .leftJoin(
      evaluationResults,
      eq(evaluationResults.evaluationId, evaluations.id),
    )
    .leftJoin(
      runErrors,
      and(
        eq(runErrors.errorableUuid, evaluationResults.uuid),
        eq(runErrors.errorableType, ErrorableEntity.EvaluationResult),
      ),
    )
    .where(
      and(
        isNull(runErrors.id),
        gte(
          evaluationResults.createdAt,
          sql<Date>`CURRENT_DATE - INTERVAL '3 months'`,
        ),
      ),
    )
    .groupBy(evaluations.workspaceId)
    .as('evaluation_results_counters')
}
