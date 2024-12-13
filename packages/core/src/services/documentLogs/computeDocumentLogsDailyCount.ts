import { and, count, eq, isNull, sql } from 'drizzle-orm'

import {
  DocumentLogFilterOptions,
  ErrorableEntity,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import { commits, documentLogs, projects, runErrors } from '../../schema'
import { buildLogsFilterSQLConditions } from './logsFilterUtils'

export type DailyCount = {
  date: string
  count: number
}

export async function computeDocumentLogsDailyCount(
  {
    documentUuid,
    filterOptions,
    workspace,
    days = 30,
  }: {
    documentUuid: string
    filterOptions?: DocumentLogFilterOptions
    workspace: Workspace
    days?: number
  },
  db = database,
): Promise<DailyCount[]> {
  const conditions = [
    eq(projects.workspaceId, workspace.id),
    isNull(runErrors.id),
    sql`${documentLogs.createdAt} >= NOW() - INTERVAL '${sql.raw(
      String(days),
    )} days'`,
    documentUuid ? eq(documentLogs.documentUuid, documentUuid) : undefined,
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean)

  const result = await db
    .select({
      date: sql<string>`DATE(${documentLogs.createdAt})`.as('date'),
      count: count(documentLogs.id).as('count'),
    })
    .from(documentLogs)
    .innerJoin(
      commits,
      and(isNull(commits.deletedAt), eq(commits.id, documentLogs.commitId)),
    )
    .leftJoin(projects, eq(projects.id, commits.projectId))
    .leftJoin(
      runErrors,
      and(
        eq(runErrors.errorableUuid, documentLogs.uuid),
        eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
      ),
    )
    .where(and(...conditions))
    .groupBy(sql`DATE(${documentLogs.createdAt})`)
    .orderBy(sql`DATE(${documentLogs.createdAt})`)

  return result.map((row) => ({
    date: row.date,
    count: Number(row.count),
  }))
}
