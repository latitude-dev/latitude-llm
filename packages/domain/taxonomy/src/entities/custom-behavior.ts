import {
  customBehaviorIdSchema,
  type FilterSet,
  facetIdSchema,
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
 * Sessions filter fields a custom behavior may never scope on, because both are
 * the taxonomy's own output rather than an input:
 *   - `topics` (labelled "Behaviors") — scoping the behavior tree by its own
 *     nodes is circular.
 *   - `moments` — defining a behavior by a behavioural moment conflates the two;
 *     moments already surface per scoped cluster inside the tree.
 * The exclusion lives in the shared contract so the web save path and the
 * gardening workflow both enforce it from one place.
 */
export const CUSTOM_BEHAVIOR_EXCLUDED_FILTER_FIELDS = ["topics", "moments"] as const

export const CUSTOM_BEHAVIOR_EXCLUDED_FILTER_MESSAGE =
  "Custom behavior filters can't use the behaviors (topics) or moments fields — both are taxonomy output, so scoping on them is circular"

/**
 * Shared FilterSet, minus the excluded fields. Lives in the domain contract so
 * both the web save path and the gardening workflow enforce the exclusion from
 * one place.
 */
export const customBehaviorFilterSetSchema: z.ZodType<FilterSet> = filterSetSchema.superRefine((filters, ctx) => {
  for (const field of CUSTOM_BEHAVIOR_EXCLUDED_FILTER_FIELDS) {
    if (Object.hasOwn(filters, field)) {
      ctx.addIssue({ code: "custom", message: CUSTOM_BEHAVIOR_EXCLUDED_FILTER_MESSAGE, path: [field] })
    }
  }
})

/**
 * Drop the excluded fields from a FilterSet so a Sessions or saved-search filter
 * can seed a custom behavior. Entry points copy a filter and strip here rather
 * than re-deriving the exclusion at each call site.
 */
export const stripCustomBehaviorExcludedFields = (filterSet: FilterSet): FilterSet => {
  if (!CUSTOM_BEHAVIOR_EXCLUDED_FILTER_FIELDS.some((field) => Object.hasOwn(filterSet, field))) return filterSet
  const rest = { ...filterSet } as Record<string, FilterSet[string]>
  for (const field of CUSTOM_BEHAVIOR_EXCLUDED_FILTER_FIELDS) delete rest[field]
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

/** A named, project-scoped view = (lens × filterSet); `facetId` null = topic lens, set = a facet lens. */
export const customBehaviorSchema = z.object({
  id: customBehaviorIdSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  slug: z.string().min(1).max(SLUG_MAX_LENGTH),
  name: z.string().min(1).max(CUSTOM_BEHAVIOR_NAME_MAX_LENGTH),
  filterSet: customBehaviorFilterSetSchema,
  facetId: facetIdSchema.nullable().default(null),
  status: customBehaviorStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type CustomBehavior = z.infer<typeof customBehaviorSchema>
