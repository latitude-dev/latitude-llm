import { sql, count, desc, eq, and, gte, isNull, max } from 'drizzle-orm'
import { database, Database } from '../../../client'
import {
  commits,
  documentLogs,
  evaluationResults,
  evaluations,
  projects,
  runErrors,
  workspaces,
} from '../../../schema'
import { ErrorableEntity } from '../../../constants'

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

  const logsCTE = db.$with('document_logs_counts').as(
    db
      .select({
        workspaceId: sql<number>`${workspaces.id}`.as(
          'document_log_workspace_id',
        ),
        logsCount: count(documentLogs.id).as('document_logs_counts'),
      })
      .from(documentLogs)
      .leftJoin(commits, eq(commits.id, documentLogs.commitId))
      .leftJoin(projects, eq(projects.id, commits.projectId))
      .leftJoin(workspaces, eq(workspaces.id, projects.workspaceId))
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
            sql<Date>`${dateCondition} - INTERVAL '1 month'`,
          ),
        ),
      )
      .groupBy(workspaces.id),
  )

  const evaluationResultsCTE = db.$with('evaluation_results_counts').as(
    db
      .select({
        workspaceId: sql<number>`${workspaces.id}`.as(
          'evaluation_result_workspace_id',
        ),
        evaluationResultsCount: count(evaluationResults.id).as(
          'evaluation_results_counts',
        ),
      })
      .from(evaluationResults)
      .leftJoin(evaluations, eq(evaluations.id, evaluationResults.evaluationId))
      .leftJoin(workspaces, eq(workspaces.id, evaluations.workspaceId))
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
            sql<Date>`${dateCondition} - INTERVAL '1 month'`,
          ),
        ),
      )
      .groupBy(workspaces.id),
  )

  return db
    .with(logsCTE, evaluationResultsCTE)
    .select({
      workspaceId: max(workspaces.id),
      name: max(workspaces.name),
      lastMonthRuns: sql<number>`SUM(
        COALESCE(${logsCTE.logsCount}, 0) +
        COALESCE(${evaluationResultsCTE.evaluationResultsCount}, 0)
      )`.as('last_month_runs'),
    })
    .from(workspaces)
    .leftJoin(logsCTE, eq(logsCTE.workspaceId, workspaces.id))
    .leftJoin(
      evaluationResultsCTE,
      eq(evaluationResultsCTE.workspaceId, workspaces.id),
    )
    .groupBy(workspaces.id)
    .orderBy(desc(sql<number>`last_month_runs`))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
}

export type GetUsageOverviewRow = Awaited<
  ReturnType<typeof getUsageOverview>
>[number]
export type GetUsageOverview = GetUsageOverviewRow[]
