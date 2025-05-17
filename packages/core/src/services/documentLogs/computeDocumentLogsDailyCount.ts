import { and, count, eq, isNull, sql } from 'drizzle-orm'

import { DocumentLogFilterOptions } from '../../browser'
import { database } from '../../client'
import { commits, documentLogs } from '../../schema'
import { buildLogsFilterSQLConditions } from './logsFilterUtils'

export type DailyCount = {
  date: string
  count: number
}

export async function computeDocumentLogsDailyCount(
  {
    documentUuid,
    filterOptions,
    days = 30,
  }: {
    documentUuid: string
    filterOptions?: DocumentLogFilterOptions
    days?: number
  },
  db = database,
): Promise<DailyCount[]> {
  const conditions = [
    sql`${documentLogs.createdAt} >= NOW() - INTERVAL '${sql.raw(
      String(days),
    )} days'`,
    eq(documentLogs.documentUuid, documentUuid),
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
    .where(and(...conditions))
    .groupBy(sql`DATE(${documentLogs.createdAt})`)
    .orderBy(sql`DATE(${documentLogs.createdAt})`)

  return result.map((row) => ({
    date: row.date,
    count: Number(row.count),
  }))
}
