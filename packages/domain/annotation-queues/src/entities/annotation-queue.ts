import { cuidSchema, type FilterSet, filterSetSchema } from "@domain/shared"
import { z } from "zod"

import { ANNOTATION_QUEUE_NAME_MAX_LENGTH } from "../constants.ts"

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const annotationQueueSettingsSchema = z.object({
  filter: filterSetSchema.optional(),
  sampling: z.number().min(0).max(100).optional(),
})

export type AnnotationQueueSettings = z.infer<typeof annotationQueueSettingsSchema>

/**
 * Normalize an AnnotationQueueSettings value at write time:
 * - strip keys with empty condition arrays
 * - strip the filter entirely when no non-empty conditions remain
 * This keeps manual/live queue semantics unambiguous.
 */
export function normalizeQueueSettings(settings: AnnotationQueueSettings): AnnotationQueueSettings {
  const { filter, ...rest } = settings
  if (!filter) return settings

  const pruned = Object.fromEntries(
    Object.entries(filter).filter(([, conditions]) => Array.isArray(conditions) && conditions.length > 0),
  ) as FilterSet

  if (Object.keys(pruned).length === 0) return rest
  if (Object.keys(pruned).length === Object.keys(filter).length) return settings
  return { ...rest, filter: pruned }
}

/** A queue is conceptually live when `settings.filter` is present. */
export function isLiveQueue(
  settings: AnnotationQueueSettings,
): settings is AnnotationQueueSettings & { filter: FilterSet } {
  return settings.filter !== undefined
}

/** A queue is conceptually manual when `settings.filter` is absent. */
export function isManualQueue(settings: AnnotationQueueSettings): boolean {
  return !isLiveQueue(settings)
}

/** A queue is system-created when `system` is true. */
export function isSystemQueue(queue: Pick<AnnotationQueue, "system">): boolean {
  return queue.system
}

// ---------------------------------------------------------------------------
// Annotation Queue entity
// ---------------------------------------------------------------------------

export const annotationQueueSchema = z.object({
  id: cuidSchema,
  organizationId: cuidSchema,
  projectId: cuidSchema,
  system: z.boolean(),
  name: z.string().min(1).max(ANNOTATION_QUEUE_NAME_MAX_LENGTH),
  description: z.string(),
  instructions: z.string(),
  settings: annotationQueueSettingsSchema,
  assignees: z.array(cuidSchema),
  totalItems: z.number().int().nonnegative(),
  completedItems: z.number().int().nonnegative(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type AnnotationQueue = z.infer<typeof annotationQueueSchema>
