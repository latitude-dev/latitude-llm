import { type CustomBehaviorId, type FilterSet, generateSlug, toSlug } from "@domain/shared"
import { Effect } from "effect"
import { CUSTOM_BEHAVIOR_NAME_MAX_LENGTH } from "../constants.ts"
import {
  CUSTOM_BEHAVIOR_EMPTY_FILTER_MESSAGE,
  type CustomBehavior,
  customBehaviorFilterSetHasConditions,
  customBehaviorFilterSetSchema,
} from "../entities/custom-behavior.ts"
import { CustomBehaviorFilterInvalidError, CustomBehaviorNameInvalidError } from "../errors.ts"
import { CustomBehaviorRepository } from "../ports/custom-behavior-repository.ts"

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
  }

  const updated: CustomBehavior = {
    ...current,
    name: nextName,
    slug: nextSlug,
    filterSet: nextFilterSet,
    updatedAt: new Date(),
  }
  yield* repo.save(updated)
  return updated
})
