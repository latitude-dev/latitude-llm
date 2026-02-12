import { and, count, eq } from 'drizzle-orm'

import { LogSources } from '../../constants'
import { spans } from '../../schema/models/spans'
import { scopedQuery } from '../scope'
import { tenancyFilter } from './filters'

export const countSpansByProjectAndSource = scopedQuery(
  async function countSpansByProjectAndSource(
    {
      workspaceId,
      projectId,
      source,
    }: {
      workspaceId: number
      projectId: number
      source?: LogSources[]
    },
    db,
  ): Promise<Record<LogSources, number>> {
    const sourcesToCount = source ?? Object.values(LogSources)
    const countsBySource: Record<LogSources, number> = {} as Record<
      LogSources,
      number
    >

    for (const src of sourcesToCount) {
      const whereClause = and(
        tenancyFilter(workspaceId),
        eq(spans.projectId, projectId),
        eq(spans.source, src),
      )

      try {
        const result = await db
          .select({ count: count() })
          .from(spans)
          .where(whereClause)
          .then((r) => r[0])

        countsBySource[src] = result?.count ?? 0
      } catch (_) {
        countsBySource[src] = 0
      }
    }

    return countsBySource
  },
)
