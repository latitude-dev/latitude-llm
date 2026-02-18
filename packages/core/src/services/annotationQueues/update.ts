import { eq } from 'drizzle-orm'

import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  annotationQueueMembers,
  annotationQueues,
  AnnotationQueue,
} from '../../schema/models/annotationQueues'

export type UpdateAnnotationQueueInput = {
  queue: AnnotationQueue
  name?: string
  description?: string | null
  membershipIds?: number[]
}

export async function updateAnnotationQueue(
  { queue, name, description, membershipIds }: UpdateAnnotationQueueInput,
  transaction = new Transaction(),
) {
  return await transaction.call<{
    queue: AnnotationQueue
  }>(async (tx) => {
    const updates: Partial<{
      name: string
      description: string | null
      updatedAt: Date
    }> = { updatedAt: new Date() }

    if (name !== undefined) {
      updates.name = name
    }
    if (description !== undefined) {
      updates.description = description
    }

    const updatedQueue = await tx
      .update(annotationQueues)
      .set(updates)
      .where(eq(annotationQueues.id, queue.id))
      .returning()
      .then((r) => r[0]!)

    if (membershipIds !== undefined) {
      await tx
        .delete(annotationQueueMembers)
        .where(eq(annotationQueueMembers.annotationQueueId, queue.id))

      if (membershipIds.length > 0) {
        await tx.insert(annotationQueueMembers).values(
          membershipIds.map((membershipId) => ({
            annotationQueueId: queue.id,
            membershipId,
          })),
        )
      }
    }

    return Result.ok({ queue: updatedQueue })
  })
}
