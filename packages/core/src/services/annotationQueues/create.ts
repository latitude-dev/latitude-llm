import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { annotationQueues } from '../../schema/models/annotationQueues'
import { Project } from '../../schema/models/types/Project'

export type CreateAnnotationQueueProps = {}

export async function createAnnotationQueue(
  {
    project,
    name,
    description,
  }: {
    project: Project
    name: string
    description?: string
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const [queue] = await tx
      .insert(annotationQueues)
      .values({
        workspaceId: project.workspaceId,
        projectId: project.id,
        name,
        description,
      })
      .returning()

    return Result.ok(queue)
  })
}
