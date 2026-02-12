import { and, eq } from 'drizzle-orm'

import { Span, SpanType } from '../../constants'
import { spans } from '../../schema/models/spans'
import { unscopedQuery } from '../scope'

export const unsafelyFindSpansByParentAndType = unscopedQuery(
  async function unsafelyFindSpansByParentAndType(
    { parentId, type }: { parentId: string; type: SpanType },
    db,
  ): Promise<Span[]> {
    return await db
      .select()
      .from(spans)
      .where(and(eq(spans.parentId, parentId), eq(spans.type, type)))
      .then((r) => r as Span[])
  },
)
