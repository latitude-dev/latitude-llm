import { and, desc, sql, SQL } from 'drizzle-orm'

import { Database } from '../../client'
import { Span } from '../../constants'
import { spans } from '../../schema/models/spans'
import {
  applyDefaultSpansCreatedAtRange,
  normalizeCreatedAtRange,
  shouldFallbackToAllTime,
} from '../../services/spans/defaultCreatedAtWindow'
import { tt } from './columns'

function buildCursorCondition(from?: { startedAt: string; id: string }) {
  if (!from) return undefined
  return sql`(${spans.startedAt}, ${spans.id}) < (${from.startedAt}, ${from.id})`
}

async function executeLimitedQuery(
  {
    conditions,
    from,
    limit,
  }: {
    conditions: SQL<unknown>[]
    from?: { startedAt: string; id: string }
    limit: number
  },
  db: Database,
) {
  const cursorCondition = buildCursorCondition(from)
  const whereConditions = [...conditions, cursorCondition].filter(
    Boolean,
  ) as SQL<unknown>[]

  const result = await db
    .select(tt)
    .from(spans)
    .where(and(...whereConditions))
    .orderBy(desc(spans.startedAt), desc(spans.id))
    .limit(limit + 1)

  const hasMore = result.length > limit
  const items = hasMore ? result.slice(0, limit) : result
  const next = hasMore
    ? {
        startedAt: items[items.length - 1]!.startedAt.toISOString(),
        id: items[items.length - 1]!.id,
      }
    : null

  return { items: items as Span[], next }
}

export async function executeWithDefaultCreatedAtAndFallback(
  {
    createdAt,
    from,
    limit,
    buildConditions,
  }: {
    createdAt?: { from?: Date; to?: Date }
    from?: { startedAt: string; id: string }
    limit: number
    buildConditions: (createdAt?: { from?: Date; to?: Date }) => SQL<unknown>[]
  },
  db: Database,
) {
  const normalizedCreatedAt = normalizeCreatedAtRange(createdAt)
  const defaultCreatedAt = applyDefaultSpansCreatedAtRange({
    createdAt: normalizedCreatedAt,
    hasCursor: Boolean(from),
  })

  const firstPage = await executeLimitedQuery(
    {
      conditions: buildConditions(defaultCreatedAt),
      from,
      limit,
    },
    db,
  )

  if (
    !shouldFallbackToAllTime({
      hasCursor: Boolean(from),
      normalizedCreatedAt,
      itemCount: firstPage.items.length,
    })
  ) {
    return { ...firstPage, didFallbackToAllTime: undefined }
  }

  const allTime = await executeLimitedQuery(
    {
      conditions: buildConditions(undefined),
      from: undefined,
      limit,
    },
    db,
  )

  return { ...allTime, didFallbackToAllTime: true }
}
