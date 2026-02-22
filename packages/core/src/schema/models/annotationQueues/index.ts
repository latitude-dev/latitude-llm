import { type InferSelectModel } from 'drizzle-orm'

import { annotationQueueItems } from './items'
import { annotationQueueMembers } from './members'
import { annotationQueues } from './queues'

export { annotationQueueItems } from './items'
export { annotationQueueMembers } from './members'
export { annotationQueues } from './queues'

export type { AnnotationQueueItemStatus } from './items'

export type AnnotationQueue = InferSelectModel<typeof annotationQueues>
export type AnnotationQueueMember = InferSelectModel<
  typeof annotationQueueMembers
>
export type AnnotationQueueItem = InferSelectModel<typeof annotationQueueItems>
