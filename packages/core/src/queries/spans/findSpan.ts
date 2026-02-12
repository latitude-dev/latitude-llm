import { and, eq } from 'drizzle-orm'

import { Span } from '../../constants'
import { spans } from '../../schema/models/spans'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const findSpan = scopedQuery(async function findSpan(
  {
    workspaceId,
    spanId,
    traceId,
  }: { workspaceId: number; spanId: string; traceId: string },
  db,
): Promise<Span | undefined> {
  const result = await db
    .select(tt)
    .from(spans)
    .where(
      and(
        tenancyFilter(workspaceId),
        eq(spans.traceId, traceId),
        eq(spans.id, spanId),
      ),
    )
    .limit(1)
  return result[0] as Span | undefined
})
