import { subDays } from 'date-fns'
import { and, eq, gte, inArray, SQL, sql } from 'drizzle-orm'
import { database } from '../../../../client'
import { Result } from '../../../../lib/Result'
import { spans } from '../../../../schema/models/spans'
import { DatabaseError } from 'pg'
import { isClickHouseSpansReadEnabled } from '../../../workspaceFeatures/isClickHouseSpansReadEnabled'
import { computeDocumentTracesDailyCount as chComputeDocumentTracesDailyCount } from '../../../../queries/clickhouse/spans/computeDocumentTracesDailyCount'

export type DailyCount = {
  date: string
  count: number
}

export async function computeDocumentTracesDailyCount(
  {
    workspaceId,
    projectId,
    documentUuid,
    commitUuids,
    days = 30,
  }: {
    workspaceId: number
    projectId: number
    documentUuid: string
    commitUuids: string[]
    days?: number
  },
  db = database,
) {
  const shouldUseClickHouse = await isClickHouseSpansReadEnabled(
    workspaceId,
    db,
  )

  if (shouldUseClickHouse) {
    const result = await chComputeDocumentTracesDailyCount({
      workspaceId,
      projectId,
      documentUuid,
      commitUuids,
      days,
    })
    return Result.ok(result)
  }

  const now = new Date()

  try {
    const conditions = [
      gte(spans.startedAt, subDays(now, days)),
      eq(spans.documentUuid, documentUuid),
      inArray(spans.commitUuid, commitUuids),
    ] as SQL<unknown>[]

    const result = await db
      .select({
        date: sql`DATE(${spans.startedAt})`.mapWith(String).as('date'),
        count: sql`count(DISTINCT ${spans.traceId})`
          .mapWith(Number)
          .as('count'),
      })
      .from(spans)
      .where(and(...conditions))
      .groupBy(sql`DATE(${spans.startedAt})`)
      .orderBy(sql`DATE(${spans.startedAt})`)

    return Result.ok<DailyCount[]>(result)
  } catch (e) {
    if (e && 'cause' in (e as DatabaseError) && (e as DatabaseError).cause) {
      return Result.error((e as DatabaseError).cause as Error)
    } else {
      return Result.error(e as Error)
    }
  }
}
