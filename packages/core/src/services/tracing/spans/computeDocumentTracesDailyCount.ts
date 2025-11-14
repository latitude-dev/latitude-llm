import { subDays } from 'date-fns'
import { and, eq, gte, SQL, sql } from 'drizzle-orm'
import { database } from '../../../client'
import { Result } from '../../../lib/Result'
import { spans } from '../../../schema/models/spans'
import { DatabaseError } from 'pg'

export type DailyCount = {
  date: string
  count: number
}

export async function computeDocumentTracesDailyCount(
  {
    documentUuid,
    commitUuid,
    days = 30,
  }: {
    documentUuid: string
    commitUuid?: string
    days?: number
  },
  db = database,
) {
  const now = new Date()

  try {
    // Count distinct traceIds per day
    const conditions = [
      gte(spans.startedAt, subDays(now, days)),
      eq(spans.documentUuid, documentUuid),
      commitUuid ? eq(spans.commitUuid, commitUuid) : undefined,
    ].filter(Boolean) as SQL<unknown>[]

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
