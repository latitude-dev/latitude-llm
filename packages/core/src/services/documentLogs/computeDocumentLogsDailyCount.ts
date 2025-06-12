import { subDays } from 'date-fns'
import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { DocumentLogFilterOptions } from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import { commits, documentLogs } from '../../schema'
import { buildLogsFilterSQLConditions } from './logsFilterUtils'

export type DailyCount = {
  date: string
  count: number
}

export async function computeDocumentLogsDailyCount(
  {
    projectId,
    documentUuid,
    filterOptions,
    days = 30,
  }: {
    projectId: number
    documentUuid: string
    filterOptions?: DocumentLogFilterOptions
    days?: number
  },
  db = database,
) {
  const now = new Date()

  const commitIds = await db
    .select({ id: commits.id })
    .from(commits)
    .where(and(isNull(commits.deletedAt), eq(commits.projectId, projectId)))
    .then((r) => r.map((r) => r.id))

  const conditions = [
    gte(documentLogs.createdAt, subDays(now, days)),
    eq(documentLogs.documentUuid, documentUuid),
    inArray(documentLogs.commitId, commitIds),
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean)

  const result = await db
    .select({
      date: sql`DATE(${documentLogs.createdAt})`.mapWith(String).as('date'),
      count: sql`count(*)`.mapWith(Number).as('count'),
    })
    .from(documentLogs)
    .where(and(...conditions))
    .groupBy(sql`DATE(${documentLogs.createdAt})`)
    .orderBy(sql`DATE(${documentLogs.createdAt})`)

  return Result.ok<DailyCount[]>(result)
}
