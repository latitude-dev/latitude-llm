import {
  annotationQueueIdSchema,
  cuidSchema,
  type FilterCondition,
  type FilterSet,
  filterSetSchema,
} from "@domain/shared"
import { z } from "zod"

import { ANNOTATION_QUEUE_NAME_MAX_LENGTH, ANNOTATION_QUEUE_SLUG_MAX_LENGTH } from "../constants.ts"

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const annotationQueueSettingsSchema = z.object({
  filter: filterSetSchema.optional(),
  sampling: z.number().min(0).max(100).optional(),
})

export type AnnotationQueueSettings = z.infer<typeof annotationQueueSettingsSchema>

function isEmptyInListCondition(cond: FilterCondition): boolean {
  return (cond.op === "in" || cond.op === "notIn") && Array.isArray(cond.value) && cond.value.length === 0
}

/**
 * Drop fields with empty condition arrays and remove `in` / `notIn` rows whose value list is empty
 * (UI placeholders before the user selects values).
 */
function pruneFilterSet(filter: FilterSet): FilterSet | undefined {
  const out: Record<string, readonly FilterCondition[]> = {}
  for (const [field, conditions] of Object.entries(filter)) {
    if (!Array.isArray(conditions) || conditions.length === 0) continue
    const next = conditions.filter((cond) => !isEmptyInListCondition(cond))
    if (next.length > 0) {
      out[field] = next
    }
  }
  return Object.keys(out).length > 0 ? (out as FilterSet) : undefined
}

/**
 * Normalize an AnnotationQueueSettings value at write time:
 * - strip keys with empty condition arrays
 * - strip `in` / `notIn` conditions with an empty value list (draft multi-select rows)
 * - strip the filter entirely when no non-empty conditions remain
 * This keeps manual/live queue semantics unambiguous.
 */
export function normalizeQueueSettings(settings: AnnotationQueueSettings): AnnotationQueueSettings {
  const { filter, ...rest } = settings
  if (!filter) return settings

  const pruned = pruneFilterSet(filter)
  if (pruned === undefined) {
    return { ...rest }
  }

  const unchanged =
    Object.keys(pruned).length === Object.keys(filter).length &&
    Object.keys(pruned).every((key) => {
      const before = filter[key]
      const after = pruned[key]
      return before !== undefined && JSON.stringify(before) === JSON.stringify(after)
    })

  if (unchanged) {
    return settings
  }
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
  id: annotationQueueIdSchema,
  organizationId: cuidSchema,
  projectId: cuidSchema,
  system: z.boolean(),
  name: z.string().min(1).max(ANNOTATION_QUEUE_NAME_MAX_LENGTH),
  slug: z.string().min(1).max(ANNOTATION_QUEUE_SLUG_MAX_LENGTH),
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
