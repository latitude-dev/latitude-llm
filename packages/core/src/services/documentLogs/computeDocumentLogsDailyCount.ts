import { and, count, eq, isNull, sql } from 'drizzle-orm'

import { Commit, ErrorableEntity } from '../../browser'
import { database } from '../../client'
import { commits, documentLogs, runErrors } from '../../schema'
import { getCommonQueryConditions } from './computeDocumentLogsWithMetadata'

export type DailyCount = {
  date: string
  count: number
}

export async function computeDocumentLogsDailyCount(
  {
    documentUuid,
    draft,
    days = 30,
  }: {
    documentUuid: string
    draft?: Commit
    days?: number
  },
  db = database,
): Promise<DailyCount[]> {
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
        sql`${documentLogs.createdAt} >= NOW() - INTERVAL '${sql.raw(
          String(days),
        )} days'`,
        getCommonQueryConditions({
          scope: documentLogs,
          documentUuid,
          draft,
        }),
      ),
    )
    .groupBy(sql`DATE(${documentLogs.createdAt})`)
    .orderBy(sql`DATE(${documentLogs.createdAt})`)

  return result.map((row) => ({
    date: row.date,
    count: Number(row.count),
  }))
}
