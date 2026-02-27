import { and, eq } from 'drizzle-orm'

import { NotFoundError } from '../../lib/errors'
import {
  annotationQueues,
  AnnotationQueue,
} from '../../schema/models/annotationQueues'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { scopeFilter } from './filters'

export const findAnnotationQueueById = scopedQuery(
  async function findAnnotationQueueById(
    { workspaceId, id }: { workspaceId: number; id: number },
    db,
  ): Promise<AnnotationQueue> {
    const result = await db
      .select(tt)
      .from(annotationQueues)
      .where(and(scopeFilter(workspaceId), eq(annotationQueues.id, id)))
      .limit(1)

    if (!result[0]) {
      throw new NotFoundError(`Annotation queue with id ${id} not found`)
    }

    return result[0] as AnnotationQueue
  },
)
