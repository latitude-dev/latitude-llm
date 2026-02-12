import { and, asc, eq, sql } from 'drizzle-orm'

import { Span } from '../../constants'
import { spans } from '../../schema/models/spans'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const findSpansBySpanAndTraceIds = scopedQuery(
  async function findSpansBySpanAndTraceIds(
    {
      workspaceId,
      spanTraceIdPairs,
    }: {
      workspaceId: number
      spanTraceIdPairs: Array<{ spanId: string; traceId: string }>
    },
    db,
  ): Promise<Span[]> {
    if (spanTraceIdPairs.length === 0) return []

    const conditions = spanTraceIdPairs.map(({ spanId, traceId }) =>
      and(eq(spans.id, spanId), eq(spans.traceId, traceId)),
    )

    const result = await db
      .select(tt)
      .from(spans)
      .where(
        and(
          tenancyFilter(workspaceId),
          sql`(${sql.join(conditions, sql` OR `)})`,
        )!,
      )
      .orderBy(asc(spans.startedAt), asc(spans.id))

    return result as Span[]
  },
)
