import { eq } from 'drizzle-orm'

import { NotFoundError } from '../../lib/errors'
import {
  annotationQueues,
  AnnotationQueue,
} from '../../schema/models/annotationQueues'
import { unscopedQuery } from '../scope'
import { tt } from './columns'

export const unsafelyFindAnnotationQueueById = unscopedQuery(
  async function unsafelyFindAnnotationQueueById(
    { id }: { id: number },
    db,
  ): Promise<AnnotationQueue> {
    const result = await db
      .select(tt)
      .from(annotationQueues)
      .where(eq(annotationQueues.id, id))
      .limit(1)

    if (!result[0]) {
      throw new NotFoundError(`Annotation queue with id ${id} not found`)
    }

    return result[0] as AnnotationQueue
  },
)
