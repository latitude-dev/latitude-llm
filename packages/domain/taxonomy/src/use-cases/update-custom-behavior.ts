import { type CustomBehaviorId, type FilterSet, generateSlug, toSlug } from "@domain/shared"
import { Effect } from "effect"
import { CUSTOM_BEHAVIOR_NAME_MAX_LENGTH } from "../constants.ts"
import {
  CUSTOM_BEHAVIOR_EMPTY_FILTER_MESSAGE,
  CUSTOM_BEHAVIOR_RESERVED_SLUG_MESSAGE,
  type CustomBehavior,
  customBehaviorFilterSetEquals,
  customBehaviorFilterSetHasConditions,
  customBehaviorFilterSetSchema,
  isReservedCustomBehaviorSlug,
} from "../entities/custom-behavior.ts"
import { CustomBehaviorFilterInvalidError, CustomBehaviorNameInvalidError } from "../errors.ts"
import { CustomBehaviorRepository } from "../ports/custom-behavior-repository.ts"
import { TaxonomyViewAssignmentRepository } from "../ports/taxonomy-view-assignment-repository.ts"
import { generateCustomBehavior } from "./generate-custom-behavior.ts"

export interface UpdateCustomBehaviorInput {
  readonly id: CustomBehaviorId
  readonly name?: string
  readonly filterSet?: FilterSet
}

export const updateCustomBehavior = Effect.fn("taxonomy.updateCustomBehavior")(function* (
  input: UpdateCustomBehaviorInput,
) {
  yield* Effect.annotateCurrentSpan("customBehaviorId", input.id)

  const repo = yield* CustomBehaviorRepository
  const current = yield* repo.findById(input.id)

  let nextName = current.name
  let nameChanged = false
  if (input.name !== undefined) {
    const trimmed = input.name.trim()
    if (trimmed.length === 0) {
      return yield* new CustomBehaviorNameInvalidError({ field: "name", message: "Name cannot be empty" })
    }
    if (trimmed.length > CUSTOM_BEHAVIOR_NAME_MAX_LENGTH) {
      return yield* new CustomBehaviorNameInvalidError({
        field: "name",
        message: `Name exceeds ${CUSTOM_BEHAVIOR_NAME_MAX_LENGTH} characters`,
      })
    }
    if (toSlug(trimmed).length === 0) {
      return yield* new CustomBehaviorNameInvalidError({
        field: "name",
        message: "Name must contain at least one letter or number",
      })
    }
    if (trimmed !== current.name) {
      nextName = trimmed
      nameChanged = true
    }
  }

  let nextFilterSet = current.filterSet
  if (input.filterSet !== undefined) {
    const parsed = customBehaviorFilterSetSchema.safeParse(input.filterSet)
    if (!parsed.success) {
      return yield* new CustomBehaviorFilterInvalidError({
        message: parsed.error.issues[0]?.message ?? "Invalid filter set",
      })
    }
    if (!customBehaviorFilterSetHasConditions(parsed.data)) {
      return yield* new CustomBehaviorFilterInvalidError({ message: CUSTOM_BEHAVIOR_EMPTY_FILTER_MESSAGE })
    }
    nextFilterSet = parsed.data
  }

  // Skip slug regeneration when the rename is purely cosmetic (toSlug is lossy;
  // "Foo" and "foo" collapse to the same slug).
  let nextSlug = current.slug
  if (nameChanged && toSlug(nextName) !== current.slug) {
    nextSlug = yield* generateSlug({
      name: nextName,
      count: (slug) => repo.countBySlug({ projectId: current.projectId, slug }),
    })
    if (isReservedCustomBehaviorSlug(nextSlug)) {
      return yield* new CustomBehaviorNameInvalidError({
        field: "name",
        message: CUSTOM_BEHAVIOR_RESERVED_SLUG_MESSAGE,
      })
    }
  }

  // Changing which sessions a view scopes redefines its cohort, so the gardened tree
  // has to be rebuilt: the assignment slice is a ReplacingMergeTree that never
  // deletes, so the old cohort's edges would keep serving alongside the new ones.
  // Projections are keyed by facet, not by cohort, so this re-clusters without
  // re-extracting.
  const cohortChanged =
    input.filterSet !== undefined && !customBehaviorFilterSetEquals(current.filterSet, nextFilterSet)

  if (cohortChanged) {
    // Purge BEFORE the save. Failing between the two then leaves an empty slice under
    // the old filter, which the next garden run rebuilds; the other order would leave
    // the new filter serving the old cohort's edges, and a retry would see the filter
    // already persisted and skip the purge for good.
    const assignments = yield* TaxonomyViewAssignmentRepository
    yield* assignments.deleteByBehavior({
      organizationId: current.organizationId,
      projectId: current.projectId,
      customBehaviorId: current.id,
    })
  }

  const updated: CustomBehavior = {
    ...current,
    name: nextName,
    slug: nextSlug,
    filterSet: nextFilterSet,
    updatedAt: new Date(),
  }
  yield* repo.save(updated)
  // Best-effort, like the create path: a failed enqueue leaves the run to the scoped
  // sweep, which is already due for a behavior whose slice was just emptied.
  if (cohortChanged) yield* generateCustomBehavior({ customBehaviorId: current.id }).pipe(Effect.ignore)
  return updated
})
