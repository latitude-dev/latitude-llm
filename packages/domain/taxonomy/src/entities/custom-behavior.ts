import {
  customBehaviorIdSchema,
  type FilterSet,
  filterSetSchema,
  organizationIdSchema,
  projectIdSchema,
  SLUG_MAX_LENGTH,
} from "@domain/shared"
import { z } from "zod"
import { CUSTOM_BEHAVIOR_NAME_MAX_LENGTH, CUSTOM_BEHAVIOR_STATUSES } from "../constants.ts"

// ---------------------------------------------------------------------------
// CustomBehaviorStatus
// ---------------------------------------------------------------------------

export const customBehaviorStatusSchema = z.enum(CUSTOM_BEHAVIOR_STATUSES)
export type CustomBehaviorStatus = z.infer<typeof customBehaviorStatusSchema>

export const CustomBehaviorStatus = {
  Pending: "pending",
  Generating: "generating",
  Ready: "ready",
  Failed: "failed",
} as const satisfies Record<string, CustomBehaviorStatus>

// ---------------------------------------------------------------------------
// FilterSet contract
// ---------------------------------------------------------------------------

/**
 * The one Sessions filter field a custom behavior may never scope on: a scoped
 * tree built from a `topics` (behaviors) filter would be circular. LAT-746 Q3
 * resolved to reuse the shared FilterSet and hard-exclude `topics` only —
 * `moments` and every other field stay allowed. See `trace-filter-fields.ts`
 * where `topics` is labelled "Behaviors".
 */
export const CUSTOM_BEHAVIOR_EXCLUDED_FILTER_FIELD = "topics"

export const CUSTOM_BEHAVIOR_TOPICS_REJECTED_MESSAGE =
  "Custom behavior filters cannot use the topics (behaviors) field: a behavior scoped on behaviors is circular"

/**
 * Shared FilterSet, minus `topics`. Lives in the domain contract so both the
 * web save path and the Phase 2 workflow enforce the exclusion from one place.
 */
export const customBehaviorFilterSetSchema: z.ZodType<FilterSet> = filterSetSchema.superRefine((filters, ctx) => {
  if (Object.hasOwn(filters, CUSTOM_BEHAVIOR_EXCLUDED_FILTER_FIELD)) {
    ctx.addIssue({
      code: "custom",
      message: CUSTOM_BEHAVIOR_TOPICS_REJECTED_MESSAGE,
      path: [CUSTOM_BEHAVIOR_EXCLUDED_FILTER_FIELD],
    })
  }
})

/**
 * Drop the excluded (`topics`) field from a FilterSet so a Sessions or saved-
 * search filter can seed a custom behavior. Entry points copy a filter and
 * strip topics here rather than re-deriving the exclusion at each call site.
 */
export const stripCustomBehaviorExcludedFields = (filterSet: FilterSet): FilterSet => {
  if (!Object.hasOwn(filterSet, CUSTOM_BEHAVIOR_EXCLUDED_FILTER_FIELD)) return filterSet
  const { [CUSTOM_BEHAVIOR_EXCLUDED_FILTER_FIELD]: _excluded, ...rest } = filterSet
  return rest
}

export const CUSTOM_BEHAVIOR_EMPTY_FILTER_MESSAGE =
  "A custom behavior needs at least one filter — an unfiltered scope is the project-wide Behaviors taxonomy"

/** A FilterSet only scopes a behavior when at least one field carries a condition. */
export const customBehaviorFilterSetHasConditions = (filterSet: FilterSet): boolean =>
  Object.values(filterSet).some((conditions) => conditions.length > 0)

// ---------------------------------------------------------------------------
// CustomBehavior
// ---------------------------------------------------------------------------

/**
 * A named, project-scoped exploration scope. Its `filterSet` selects the
 * sessions the Phase 2 workflow samples and clusters into a scoped behavior
 * sub-tree (mirrored by `custom_behavior_id`-tagged rows in Postgres and the
 * ClickHouse `custom_behavior_assignments` slice).
 */
export const customBehaviorSchema = z.object({
  id: customBehaviorIdSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  slug: z.string().min(1).max(SLUG_MAX_LENGTH),
  name: z.string().min(1).max(CUSTOM_BEHAVIOR_NAME_MAX_LENGTH),
  filterSet: customBehaviorFilterSetSchema,
  status: customBehaviorStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type CustomBehavior = z.infer<typeof customBehaviorSchema>
