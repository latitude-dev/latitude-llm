import { type InferSelectModel } from 'drizzle-orm'

import { annotationQueues } from '../annotationQueues/queues'
import { annotationQueueMembers } from '../annotationQueues/members'

export type AnnotationQueue = InferSelectModel<typeof annotationQueues>
export type AnnotationQueueMember = InferSelectModel<
  typeof annotationQueueMembers
>
