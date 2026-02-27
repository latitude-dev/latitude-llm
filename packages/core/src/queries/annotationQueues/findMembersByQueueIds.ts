import { and, eq, inArray } from 'drizzle-orm'

import { annotationQueueMembers } from '../../schema/models/annotationQueues'
import { annotationQueues } from '../../schema/models/annotationQueues'
import { AnnotationQueueMember } from '../../schema/models/types/AnnotationQueue'
import { scopedQuery } from '../scope'

export const findMembersByQueueIds = scopedQuery(
  async function findMembersByQueueIds(
    {
      workspaceId,
      queueIds,
    }: {
      workspaceId: number
      queueIds: number[]
    },
    db,
  ): Promise<AnnotationQueueMember[]> {
    if (!queueIds.length) return []

    return db
      .select({
        id: annotationQueueMembers.id,
        annotationQueueId: annotationQueueMembers.annotationQueueId,
        membershipId: annotationQueueMembers.membershipId,
        createdAt: annotationQueueMembers.createdAt,
        updatedAt: annotationQueueMembers.updatedAt,
      })
      .from(annotationQueueMembers)
      .innerJoin(
        annotationQueues,
        eq(annotationQueueMembers.annotationQueueId, annotationQueues.id),
      )
      .where(
        and(
          inArray(annotationQueueMembers.annotationQueueId, queueIds),
          eq(annotationQueues.workspaceId, workspaceId),
        ),
      )
  },
)
