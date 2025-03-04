import { sql, desc, eq, and, gte, isNull, max } from 'drizzle-orm'
import { database, Database } from '../../../client'
import {
  commits,
  documentLogs,
  evaluationResults,
  evaluationResultsV2,
  evaluations,
  projects,
  runErrors,
  workspaces,
} from '../../../schema'
import { ErrorableEntity } from '../../../constants'
import { workspaceUsageInfoCTE } from './workspaceUsageInfoQuery'
import { SubscriptionPlan } from '../../../plans'

/**
 * Nice and big query. DON'T GET INTIMIDATED BY IT!
 *
 * This query do the following:
 * 1. Get the workspaceId, name, subscriptionPlan, numOfMembers, emails, lastMonthRuns, lastTwoMonthsRuns, and latestRunAt
 * 2. Get the last month and last two months logs and evaluation results count
 * 3. Filter out logs and evaluation results with errors
 * 4. Group by workspaceId and latestRunAt
 * 5. Order by last_month_runs and num_of_members
 * 6. Limit and offset the result
 *
 * It's done by using CTEs (Common Table Expressions) to make the query more readable, maintainable and performant.
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
  db: Database = database,
) {
  const targetDate =
    target?.toISOString().replace('T', ' ').replace('Z', '') ?? undefined
  const dateCondition = targetDate
    ? sql<Date>`CAST(${targetDate} AS DATE)`
    : sql<Date>`CURRENT_DATE`

  const errorsCTE = db.$with('run_errors_counts').as(
    db
      .select({
        id: runErrors.id,
        errorableUuid: runErrors.errorableUuid,
        errorableType: runErrors.errorableType,
      })
      .from(runErrors),
  )
  const projectsCTE = db.$with('projects_cte').as(
    db
      .select({
        id: projects.id,
        workspaceId: projects.workspaceId,
      })
      .from(projects),
  )
  const logsCTE = db.$with('document_logs_counts').as(
    db
      .with(projectsCTE, errorsCTE)
      .select({
        workspaceId: sql<number>`${workspaces.id}`.as(
          'document_log_workspace_id',
        ),
        latestCreatedAt: max(documentLogs.createdAt).as(
          'latest_log_created_at',
        ),
        lastMonthCount: sql<number>`
          COUNT(
            CASE WHEN ${documentLogs.createdAt} >= ${dateCondition} - INTERVAL '1 month'
              THEN 1 ELSE NULL
            END
          )
        `.as('last_month_logs_count'),
        lastTwoMonthsCount: sql<number>`
          COUNT(
            CASE WHEN ${documentLogs.createdAt} BETWEEN ${dateCondition} - INTERVAL '2 months'
              AND ${dateCondition} - INTERVAL '1 month'
              THEN 1 ELSE NULL
            END
          )
        `.as('last_two_months_logs_count'),
      })
      .from(documentLogs)
      .leftJoin(commits, eq(commits.id, documentLogs.commitId))
      .leftJoin(projectsCTE, eq(projectsCTE.id, commits.projectId))
      .leftJoin(workspaces, eq(workspaces.id, projectsCTE.workspaceId))
      .leftJoin(
        errorsCTE,
        and(
          eq(errorsCTE.errorableUuid, documentLogs.uuid),
          eq(errorsCTE.errorableType, ErrorableEntity.DocumentLog),
        ),
      )
      .where(
        and(
          isNull(errorsCTE.id),
          gte(
            documentLogs.createdAt,
            sql<Date>`${dateCondition} - INTERVAL '2 months'`,
          ),
        ),
      )
      .groupBy(workspaces.id),
  )

  const evaluationResultsCTE = db.$with('evaluation_results_counts').as(
    db
      .with(errorsCTE)
      .select({
        workspaceId: sql<number>`${workspaces.id}`.as(
          'evaluation_result_workspace_id',
        ),
        latestCreatedAt: max(evaluationResults.createdAt).as(
          'latest_evaluation_result_created_at',
        ),
        lastMonthCount: sql<number>`
          COUNT(
            CASE WHEN ${evaluationResults.createdAt} >= ${dateCondition} - INTERVAL '1 month'
              THEN 1 ELSE NULL
            END
          )
        `.as('last_month_evaluation_results_count'),
        lastTwoMonthsCount: sql<number>`
          COUNT(
            CASE WHEN ${evaluationResults.createdAt} BETWEEN ${dateCondition} - INTERVAL '2 months'
              AND ${dateCondition} - INTERVAL '1 month'
              THEN 1 ELSE NULL
            END
          )
        `.as('last_two_months_evaluation_results_count'),
      })
      .from(evaluationResults)
      .leftJoin(evaluations, eq(evaluations.id, evaluationResults.evaluationId))
      .leftJoin(workspaces, eq(workspaces.id, evaluations.workspaceId))
      .leftJoin(
        errorsCTE,
        and(
          eq(errorsCTE.errorableUuid, evaluationResults.uuid),
          eq(errorsCTE.errorableType, ErrorableEntity.EvaluationResult),
        ),
      )
      .where(
        and(
          isNull(errorsCTE.id),
          gte(
            evaluationResults.createdAt,
            sql<Date>`${dateCondition} - INTERVAL '2 months'`,
          ),
        ),
      )
      .groupBy(workspaces.id),
  )

  const evaluationResultsV2CTE = db.$with('evaluation_results_v2_counts').as(
    db
      .with(errorsCTE)
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
            CASE WHEN ${evaluationResultsV2.createdAt} BETWEEN ${dateCondition} - INTERVAL '2 months'
              AND ${dateCondition} - INTERVAL '1 month'
              THEN 1 ELSE NULL
            END
          )
        `.as('last_two_months_evaluation_results_v2_count'),
      })
      .from(evaluationResultsV2)
      .leftJoin(
        errorsCTE,
        and(
          eq(errorsCTE.errorableUuid, evaluationResultsV2.uuid),
          eq(errorsCTE.errorableType, ErrorableEntity.EvaluationResult),
        ),
      )
      .where(
        and(
          isNull(errorsCTE.id),
          gte(
            evaluationResultsV2.createdAt,
            sql<Date>`${dateCondition} - INTERVAL '2 months'`,
          ),
        ),
      )
      .groupBy(evaluationResultsV2.workspaceId),
  )

  const query = db
    .with(
      workspaceUsageInfoCTE,
      logsCTE,
      evaluationResultsCTE,
      evaluationResultsV2CTE,
    )
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
      lastMonthRuns: sql<number>`SUM(
        COALESCE(${logsCTE.lastMonthCount}, 0) +
        COALESCE(${evaluationResultsCTE.lastMonthCount}, 0) +
        COALESCE(${evaluationResultsV2CTE.lastMonthCount}, 0)
      )`.as('last_month_runs'),
      lastTwoMonthsRuns: sql<number>`SUM(
        COALESCE(${logsCTE.lastTwoMonthsCount}, 0) +
        COALESCE(${evaluationResultsCTE.lastTwoMonthsCount}, 0) +
        COALESCE(${evaluationResultsV2CTE.lastTwoMonthsCount}, 0)
      )`.as('last_two_months_runs'),
      latestRunAt: sql<Date | string>`GREATEST(
        ${logsCTE.latestCreatedAt},
        ${evaluationResultsCTE.latestCreatedAt},
        ${evaluationResultsV2CTE.latestCreatedAt}
      )`.as('latest_run_at'),
    })
    .from(workspaces)
    .leftJoin(
      workspaceUsageInfoCTE,
      eq(workspaceUsageInfoCTE.id, workspaces.id),
    )
    .leftJoin(logsCTE, eq(logsCTE.workspaceId, workspaces.id))
    .leftJoin(
      evaluationResultsCTE,
      eq(evaluationResultsCTE.workspaceId, workspaces.id),
    )
    .leftJoin(
      evaluationResultsV2CTE,
      eq(evaluationResultsV2CTE.workspaceId, workspaces.id),
    )
    .groupBy(workspaces.id, sql`latest_run_at`)
    .orderBy(
      desc(sql<number>`last_month_runs`),
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
