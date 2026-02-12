import { eq } from 'drizzle-orm'

import { DEFAULT_PAGINATION_SIZE, LogSources, SpanType } from '../../constants'
import { spans } from '../../schema/models/spans'
import { scopedQuery } from '../scope'
import { buildSpanFilterConditions } from './filters'
import { executeWithDefaultCreatedAtAndFallback } from './helpers'

export const findSpansByProjectLimited = scopedQuery(
  async function findSpansByProjectLimited(
    {
      workspaceId,
      projectId,
      types,
      from,
      source,
      limit = DEFAULT_PAGINATION_SIZE,
      experimentUuids,
      createdAt,
    }: {
      workspaceId: number
      projectId: number
      types?: SpanType[]
      from?: { startedAt: string; id: string }
      source?: LogSources[]
      limit?: number
      experimentUuids?: string[]
      createdAt?: { from?: Date; to?: Date }
    },
    db,
  ) {
    return executeWithDefaultCreatedAtAndFallback(
      {
        createdAt,
        from,
        limit,
        buildConditions: (queryCreatedAt) => [
          ...buildSpanFilterConditions({
            workspaceId,
            types,
            source,
            experimentUuids,
            createdAt: queryCreatedAt,
          }),
          eq(spans.projectId, projectId),
        ],
      },
      db,
    )
  },
)
