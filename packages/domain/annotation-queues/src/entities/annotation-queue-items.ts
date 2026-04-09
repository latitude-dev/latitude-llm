import { annotationQueueIdSchema, annotationQueueItemIdSchema, cuidSchema, traceIdSchema } from "@domain/shared"
import { z } from "zod"

export const ANNOTATION_QUEUE_ITEM_STATUSES = ["pending", "inProgress", "completed"] as const

export type AnnotationQueueItemStatus = (typeof ANNOTATION_QUEUE_ITEM_STATUSES)[number]

export const annotationQueueItemSchema = z.object({
  id: annotationQueueItemIdSchema,
  organizationId: cuidSchema,
  projectId: cuidSchema,
  queueId: annotationQueueIdSchema,
  traceId: traceIdSchema,
  completedAt: z.date().nullable(),
  completedBy: cuidSchema.nullable(),
  reviewStartedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type AnnotationQueueItem = z.infer<typeof annotationQueueItemSchema>
