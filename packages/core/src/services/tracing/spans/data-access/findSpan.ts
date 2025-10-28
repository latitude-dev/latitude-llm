import { and, eq } from 'drizzle-orm'
import { database } from '../../../../client'
import { spans } from '../../../../schema/models/spans'

export async function findSpan(
  { traceId, spanId }: { traceId: string; spanId: string },
  db = database,
) {
  return db
    .select()
    .from(spans)
    .where(and(eq(spans.id, spanId), eq(spans.traceId, traceId)))
    .then((r) => r[0])
}
