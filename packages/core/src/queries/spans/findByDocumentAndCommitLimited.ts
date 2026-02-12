import { eq, inArray } from 'drizzle-orm'

import { DEFAULT_PAGINATION_SIZE, LogSources, SpanType } from '../../constants'
import { spans } from '../../schema/models/spans'
import { scopedQuery } from '../scope'
import { buildSpanFilterConditions } from './filters'
import { executeWithDefaultCreatedAtAndFallback } from './helpers'

export const findSpansByDocumentAndCommitLimited = scopedQuery(
  async function findSpansByDocumentAndCommitLimited(
    {
      workspaceId,
      documentUuid,
      types,
      from,
      limit = DEFAULT_PAGINATION_SIZE,
      commitUuids,
      experimentUuids,
      source,
      testDeploymentIds,
      createdAt,
    }: {
      workspaceId: number
      documentUuid: string
      types?: SpanType[]
      from?: { startedAt: string; id: string }
      limit?: number
      commitUuids?: string[]
      experimentUuids?: string[]
      source?: LogSources[]
      testDeploymentIds?: number[]
      createdAt?: { from?: Date; to?: Date }
    },
    db,
  ) {
    return executeWithDefaultCreatedAtAndFallback(
      {
        createdAt,
        from,
        limit,
        buildConditions: (queryCreatedAt) => {
          const conditions = [
            ...buildSpanFilterConditions({
              workspaceId,
              types,
              source,
              experimentUuids,
              createdAt: queryCreatedAt,
            }),
            eq(spans.documentUuid, documentUuid),
          ]

          if (commitUuids && commitUuids.length > 0) {
            conditions.push(inArray(spans.commitUuid, commitUuids))
          }

          if (testDeploymentIds && testDeploymentIds.length > 0) {
            conditions.push(inArray(spans.testDeploymentId, testDeploymentIds))
          }

          return conditions
        },
      },
      db,
    )
  },
)
