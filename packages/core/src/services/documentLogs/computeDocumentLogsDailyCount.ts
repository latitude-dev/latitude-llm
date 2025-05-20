import { and, count, eq, isNull, sql } from 'drizzle-orm'

import {
  DocumentLogFilterOptions,
  DocumentVersion,
  ErrorableEntity,
} from '../../browser'
import { database } from '../../client'
import { commits, documentLogs, runErrors } from '../../schema'
import { buildLogsFilterSQLConditions } from './logsFilterUtils'

export type DailyCount = {
  date: string
  count: number
}

export async function computeDocumentLogsDailyCount(
  {
    document,
    filterOptions,
    days = 30,
  }: {
    document: DocumentVersion
    filterOptions?: DocumentLogFilterOptions
    days?: number
  },
  db = database,
): Promise<DailyCount[]> {
  const conditions = [
    sql`${documentLogs.createdAt} >= NOW() - INTERVAL '${sql.raw(
      String(days),
    )} days'`,
    eq(documentLogs.documentUuid, document.documentUuid),
    isNull(commits.deletedAt),
    isNull(runErrors.id),
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean)

  // TODO(perf): This query is slow
  const result = await db
    .select({
      date: sql<string>`DATE(${documentLogs.createdAt})`.as('date'),
      count: count(documentLogs.id).as('count'),
    })
    .from(documentLogs)
    .innerJoin(commits, eq(commits.id, documentLogs.commitId))
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
