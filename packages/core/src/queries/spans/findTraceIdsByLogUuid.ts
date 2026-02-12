import { and, desc, eq } from 'drizzle-orm'

import { spans } from '../../schema/models/spans'
import { scopedQuery } from '../scope'
import { tenancyFilter } from './filters'

export const findLastTraceIdByLogUuid = scopedQuery(
  async function findLastTraceIdByLogUuid(
    { workspaceId, logUuid }: { workspaceId: number; logUuid: string },
    db,
  ): Promise<string | undefined> {
    return await db
      .select({ traceId: spans.traceId })
      .from(spans)
      .where(
        and(tenancyFilter(workspaceId), eq(spans.documentLogUuid, logUuid)),
      )
      .orderBy(desc(spans.startedAt))
      .limit(1)
      .then((r) => r[0]?.traceId)
  },
)

export const findTraceIdsByLogUuid = scopedQuery(
  async function findTraceIdsByLogUuid(
    { workspaceId, logUuid }: { workspaceId: number; logUuid: string },
    db,
  ): Promise<string[]> {
    return await db
      .selectDistinctOn([spans.traceId], { traceId: spans.traceId })
      .from(spans)
      .where(
        and(tenancyFilter(workspaceId), eq(spans.documentLogUuid, logUuid)),
      )
      .orderBy(spans.traceId, desc(spans.startedAt))
      .then((r) => r.map((r) => r.traceId))
  },
)
