import { and, count, eq } from 'drizzle-orm'
import { SpanType } from '../../../constants'
import { database } from '../../../client'
import { spans } from '../../../schema/models/spans'
import { isClickHouseSpansReadEnabled } from '../../../services/workspaceFeatures/isClickHouseSpansReadEnabled'
import { countExternalSpans } from './countExternalSpans'

/**
 * Returns true if the workspace has at least one span of type External (ICP check).
 * Uses PG or ClickHouse based on workspace feature flag; count-only, no span rows fetched.
 */
export async function hasAtLeastOneExternalSpan(
  workspaceId: number,
  db = database,
): Promise<boolean> {
  const useClickHouse = await isClickHouseSpansReadEnabled(workspaceId, db)
  if (useClickHouse) {
    const n = await countExternalSpans({ workspaceId }, db)
    return n >= 1
  }
  const result = await db
    .select({ count: count() })
    .from(spans)
    .where(
      and(
        eq(spans.workspaceId, workspaceId),
        eq(spans.type, SpanType.External),
      ),
    )
    .then((r) => r[0]!.count)
  return result >= 1
}
