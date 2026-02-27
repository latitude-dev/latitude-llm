import { and, eq, lt, or, sql, desc } from 'drizzle-orm'

import {
  annotationQueues,
  AnnotationQueue,
} from '../../schema/models/annotationQueues'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { scopeFilter } from './filters'

export type FindByProjectIdResult = {
  items: AnnotationQueue[]
  next: { createdAt: string; id: number } | null
  count: number
}

export const findAnnotationQueuesByProjectId = scopedQuery(
  async function findAnnotationQueuesByProjectId(
    {
      workspaceId,
      projectId,
      from,
      limit = 20,
    }: {
      workspaceId: number
      projectId: number
      from?: { createdAt: string; id: number }
      limit?: number
    },
    db,
  ): Promise<FindByProjectIdResult> {
    const baseWhere = and(
      scopeFilter(workspaceId),
      eq(annotationQueues.projectId, projectId),
    )

    const cursorCondition = from
      ? or(
          lt(annotationQueues.createdAt, new Date(from.createdAt)),
          and(
            eq(annotationQueues.createdAt, new Date(from.createdAt)),
            lt(annotationQueues.id, from.id),
          ),
        )
      : undefined

    const where = cursorCondition ? and(baseWhere, cursorCondition) : baseWhere
    const fetchLimit = limit + 1

    const [rows, countResult] = await Promise.all([
      db
        .select(tt)
        .from(annotationQueues)
        .where(where)
        .orderBy(desc(annotationQueues.createdAt), desc(annotationQueues.id))
        .limit(fetchLimit),
      db
        .select({ count: sql<number>`count(*)` })
        .from(annotationQueues)
        .where(baseWhere),
    ])

    const hasMore = rows.length > limit
    const items = (hasMore ? rows.slice(0, limit) : rows) as AnnotationQueue[]
    const count = Number(countResult[0]?.count ?? 0)

    const last = items[items.length - 1]
    const next =
      hasMore && last
        ? { createdAt: last.createdAt.toISOString(), id: last.id }
        : null

    return { items, next, count }
  },
)
