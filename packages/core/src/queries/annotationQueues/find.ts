import { eq } from 'drizzle-orm'
import { NotFoundError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { Database, database } from '../../client'
import {
  annotationQueues,
  AnnotationQueue,
} from '../../schema/models/annotationQueues'

export async function findAnnotationQueueById(
  id: number,
  db: Database = database,
): Promise<TypedResult<AnnotationQueue>> {
  const result = await db
    .select()
    .from(annotationQueues)
    .where(eq(annotationQueues.id, id))
    .limit(1)

  const queue = result[0]
  if (!queue) {
    return Result.error(new NotFoundError('Annotation queue not found'))
  }

  return Result.ok(queue)
}

export async function findAllAnnotationQueues(
  db: Database = database,
): Promise<AnnotationQueue[]> {
  return db.select().from(annotationQueues)
}
