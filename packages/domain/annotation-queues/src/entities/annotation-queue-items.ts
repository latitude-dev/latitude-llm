import { cuidSchema } from "@domain/shared"
import { traceIdSchema } from "@domain/spans"
import { z } from "zod"

export const ANNOTATION_QUEUE_ITEM_STATUSES = ["pending", "inProgress", "completed"] as const

export type AnnotationQueueItemStatus = (typeof ANNOTATION_QUEUE_ITEM_STATUSES)[number]

export const annotationQueueItemSchema = z.object({
  id: cuidSchema,
  organizationId: cuidSchema,
  projectId: cuidSchema,
  queueId: cuidSchema,
  traceId: traceIdSchema,
  completedAt: z.date().nullable(),
  completedBy: cuidSchema.nullable(),
  reviewStartedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type AnnotationQueueItem = z.infer<typeof annotationQueueItemSchema>
