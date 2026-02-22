import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  annotationQueueMembers,
  annotationQueues,
  AnnotationQueue,
} from '../../schema/models/annotationQueues'
import { Membership } from '../../schema/models/types/Membership'
import { Project } from '../../schema/models/types/Project'
import { Workspace } from '../../schema/models/types/Workspace'

export type CreateAnnotationQueueInput = {
  workspace: Workspace
  project: Project
  name: string
  description?: string | null
  membershipIds?: number[]
}

export async function createAnnotationQueue(
  { workspace, project, name, description, membershipIds = [] }: CreateAnnotationQueueInput,
  transaction = new Transaction(),
) {
  return await transaction.call<{
    queue: AnnotationQueue
    membershipIds: number[]
  }>(async (tx) => {
    const queue = await tx
      .insert(annotationQueues)
      .values({
        workspaceId: workspace.id,
        projectId: project.id,
        name,
        description: description ?? null,
      })
      .returning()
      .then((r) => r[0]!)

    if (membershipIds.length > 0) {
      await tx.insert(annotationQueueMembers).values(
        membershipIds.map((membershipId) => ({
          annotationQueueId: queue.id,
          membershipId,
        })),
      )
    }

    return Result.ok({ queue, membershipIds })
  })
}
