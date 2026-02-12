import { and, eq, or } from 'drizzle-orm'

import { Span, SpanType } from '../../constants'
import { spans } from '../../schema/models/spans'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const findCompletionSpansByParentIds = scopedQuery(
  async function findCompletionSpansByParentIds(
    {
      workspaceId,
      parentIds,
    }: {
      workspaceId: number
      parentIds: Array<{ traceId: string; spanId: string }>
    },
    db,
  ): Promise<Map<string, Span<SpanType.Completion>>> {
    if (parentIds.length === 0) {
      return new Map()
    }

    const conditions = parentIds.map(({ spanId }) =>
      eq(spans.parentId, spanId),
    )

    const result = await db
      .select(tt)
      .from(spans)
      .where(
        and(
          tenancyFilter(workspaceId),
          eq(spans.type, SpanType.Completion),
          or(...conditions),
        ),
      )

    const completionsByParent = new Map<string, Span<SpanType.Completion>>()
    for (const completion of result) {
      if (completion.parentId) {
        const parentKey = `${completion.traceId}:${completion.parentId}`
        if (!completionsByParent.has(parentKey)) {
          completionsByParent.set(
            parentKey,
            completion as Span<SpanType.Completion>,
          )
        }
      }
    }

    return completionsByParent
  },
)
