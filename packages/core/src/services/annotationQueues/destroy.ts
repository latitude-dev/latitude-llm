import { eq } from 'drizzle-orm'

import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  annotationQueues,
  AnnotationQueue,
} from '../../schema/models/annotationQueues'

export async function destroyAnnotationQueue(
  queue: AnnotationQueue,
  transaction = new Transaction(),
) {
  return await transaction.call<{ queue: AnnotationQueue }>(async (tx) => {
    const deleted = await tx
      .delete(annotationQueues)
      .where(eq(annotationQueues.id, queue.id))
      .returning()
      .then((r) => r[0]!)

    return Result.ok({ queue: deleted })
  })
}
