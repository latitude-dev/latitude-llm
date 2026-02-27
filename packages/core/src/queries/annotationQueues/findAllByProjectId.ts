import { and, eq } from 'drizzle-orm'

import {
  annotationQueues,
  AnnotationQueue,
} from '../../schema/models/annotationQueues'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { scopeFilter } from './filters'

export const findAllAnnotationQueuesByProjectId = scopedQuery(
  async function findAllAnnotationQueuesByProjectId(
    {
      workspaceId,
      projectId,
    }: {
      workspaceId: number
      projectId: number
    },
    db,
  ): Promise<AnnotationQueue[]> {
    const result = await db
      .select(tt)
      .from(annotationQueues)
      .where(
        and(
          scopeFilter(workspaceId),
          eq(annotationQueues.projectId, projectId),
        ),
      )

    return result as AnnotationQueue[]
  },
)
