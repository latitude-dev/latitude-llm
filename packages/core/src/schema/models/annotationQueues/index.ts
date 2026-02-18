import { type InferSelectModel } from 'drizzle-orm'

import { annotationQueueMembers } from './members'
import { annotationQueues } from './queues'

export { annotationQueueMembers } from './members'
export { annotationQueues } from './queues'

export type AnnotationQueue = InferSelectModel<typeof annotationQueues>
export type AnnotationQueueMember = InferSelectModel<
  typeof annotationQueueMembers
>
