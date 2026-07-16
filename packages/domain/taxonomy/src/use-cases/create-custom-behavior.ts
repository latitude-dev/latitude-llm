import {
  CustomBehaviorId,
  type FilterSet,
  generateId,
  generateSlug,
  type ProjectId,
  SqlClient,
  toSlug,
} from "@domain/shared"
import { Effect } from "effect"
import { CUSTOM_BEHAVIOR_NAME_MAX_LENGTH, MAX_CUSTOM_BEHAVIORS_PER_PROJECT } from "../constants.ts"
import {
  CUSTOM_BEHAVIOR_EMPTY_FILTER_MESSAGE,
  type CustomBehavior,
  CustomBehaviorStatus,
  customBehaviorFilterSetHasConditions,
  customBehaviorFilterSetSchema,
} from "../entities/custom-behavior.ts"
import {
  CustomBehaviorFilterInvalidError,
  CustomBehaviorLimitReachedError,
  CustomBehaviorNameInvalidError,
} from "../errors.ts"
import { CustomBehaviorRepository } from "../ports/custom-behavior-repository.ts"

export interface CreateCustomBehaviorInput {
  readonly id?: CustomBehaviorId
  readonly projectId: ProjectId
  readonly name: string
  readonly filterSet: FilterSet
}

export const createCustomBehavior = Effect.fn("taxonomy.createCustomBehavior")(function* (
  input: CreateCustomBehaviorInput,
) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)

  const trimmedName = input.name.trim()
  if (trimmedName.length === 0) {
    return yield* new CustomBehaviorNameInvalidError({ field: "name", message: "Name cannot be empty" })
  }
  if (trimmedName.length > CUSTOM_BEHAVIOR_NAME_MAX_LENGTH) {
    return yield* new CustomBehaviorNameInvalidError({
      field: "name",
      message: `Name exceeds ${CUSTOM_BEHAVIOR_NAME_MAX_LENGTH} characters`,
    })
  }
  if (toSlug(trimmedName).length === 0) {
    return yield* new CustomBehaviorNameInvalidError({
      field: "name",
      message: "Name must contain at least one letter or number",
    })
  }

  // Defense-in-depth on the 1a Zod contract: reject a FilterSet scoping on `topics` (circular).
  const parsedFilterSet = customBehaviorFilterSetSchema.safeParse(input.filterSet)
  if (!parsedFilterSet.success) {
    return yield* new CustomBehaviorFilterInvalidError({
      message: parsedFilterSet.error.issues[0]?.message ?? "Invalid filter set",
    })
  }
  if (!customBehaviorFilterSetHasConditions(parsedFilterSet.data)) {
    return yield* new CustomBehaviorFilterInvalidError({ message: CUSTOM_BEHAVIOR_EMPTY_FILTER_MESSAGE })
  }

  const sqlClient = yield* SqlClient
  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const repo = yield* CustomBehaviorRepository

      // Soft cost guard (MVP): count-based, not locked, so concurrent creates may briefly overshoot by a few. Intentional — see LAT-748.
      const existing = yield* repo.countByProject({ projectId: input.projectId })
      if (existing >= MAX_CUSTOM_BEHAVIORS_PER_PROJECT) {
        return yield* new CustomBehaviorLimitReachedError({
          projectId: input.projectId,
          limit: MAX_CUSTOM_BEHAVIORS_PER_PROJECT,
        })
      }

      const slug = yield* generateSlug({
        name: trimmedName,
        count: (slug) => repo.countBySlug({ projectId: input.projectId, slug }),
      })

      const now = new Date()
      const behavior: CustomBehavior = {
        id: input.id ?? CustomBehaviorId(generateId()),
        organizationId: sqlClient.organizationId,
        projectId: input.projectId,
        slug,
        name: trimmedName,
        filterSet: parsedFilterSet.data,
        status: CustomBehaviorStatus.Pending,
        createdAt: now,
        updatedAt: now,
      }

      yield* repo.save(behavior)
      return behavior
    }),
  )
})
