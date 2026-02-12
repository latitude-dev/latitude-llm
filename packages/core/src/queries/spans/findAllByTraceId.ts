import { and, asc, eq } from 'drizzle-orm'

import { Span } from '../../constants'
import { spans } from '../../schema/models/spans'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const findAllSpansByTraceId = scopedQuery(
  async function findAllSpansByTraceId(
    { workspaceId, traceId }: { workspaceId: number; traceId: string },
    db,
  ): Promise<Span[]> {
    const result = await db
      .select(tt)
      .from(spans)
      .where(and(tenancyFilter(workspaceId), eq(spans.traceId, traceId)))
      .orderBy(asc(spans.startedAt), asc(spans.id))
    return result as Span[]
  },
)
