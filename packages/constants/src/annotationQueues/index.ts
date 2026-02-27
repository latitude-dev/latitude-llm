export const ANNOTATION_QUEUE_ITEM_STATUS = {
  pending: 'pending',
  in_progress: 'in_progress',
  completed: 'completed',
} as const

export type AnnotationQueueItemStatus =
  (typeof ANNOTATION_QUEUE_ITEM_STATUS)[keyof typeof ANNOTATION_QUEUE_ITEM_STATUS]
