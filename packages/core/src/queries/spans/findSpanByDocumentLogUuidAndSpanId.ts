import { and, eq, inArray } from 'drizzle-orm'

import { Span } from '../../constants'
import { spans } from '../../schema/models/spans'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'
import { findTraceIdsByLogUuid } from './findTraceIdsByLogUuid'

export const findSpanByDocumentLogUuidAndSpanId = scopedQuery(
  async function findSpanByDocumentLogUuidAndSpanId(
    {
      workspaceId,
      documentLogUuid,
      spanId,
    }: { workspaceId: number; documentLogUuid: string; spanId: string },
    db,
  ): Promise<Span | undefined> {
    const traceIds = await findTraceIdsByLogUuid(
      { workspaceId, logUuid: documentLogUuid },
      db,
    )
    if (traceIds.length === 0) return undefined

    const result = await db
      .select(tt)
      .from(spans)
      .where(
        and(
          tenancyFilter(workspaceId),
          inArray(spans.traceId, traceIds),
          eq(spans.id, spanId),
        ),
      )
      .limit(1)
    return result[0] as Span | undefined
  },
)
