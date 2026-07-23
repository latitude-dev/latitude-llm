import {
  CustomBehaviorId,
  type FacetId,
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
import { generateCustomBehavior } from "./generate-custom-behavior.ts"

export interface CreateCustomBehaviorInput {
  readonly id?: CustomBehaviorId
  readonly projectId: ProjectId
  readonly name: string
  readonly filterSet: FilterSet
  /**
   * The lens. Omit/null = topic (clusters observation embeddings, requires a
   * non-empty filter). An id = a facet lens (clusters that facet's extracted
   * projections), which makes an empty filter valid (whole-project through the lens).
   */
  readonly facetId?: FacetId | null
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
  // A facet lens makes an empty filter valid (whole-project through the lens). The
  // only invalid shape is the topic lens with no filter — that's just the live
  // global tree, not a distinct view.
  if (input.facetId == null && !customBehaviorFilterSetHasConditions(parsedFilterSet.data)) {
    return yield* new CustomBehaviorFilterInvalidError({ message: CUSTOM_BEHAVIOR_EMPTY_FILTER_MESSAGE })
  }

  const sqlClient = yield* SqlClient
  const created = yield* sqlClient.transaction(
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
        facetId: input.facetId ?? null,
        status: CustomBehaviorStatus.Pending,
        createdAt: now,
        updatedAt: now,
      }

      yield* repo.save(behavior)
      return behavior
    }),
  )

  // Custom behaviors garden automatically, like the global taxonomy: creating
  // one kicks off its first run immediately, then the scoped cron sweep keeps it
  // living. There is no manual trigger. Best-effort — the enqueue runs after the
  // create commits, so if it fails the row stays `pending` and the next sweep
  // gardens it (last_gardened_at is null).
  return yield* generateCustomBehavior({ customBehaviorId: created.id }).pipe(Effect.orElseSucceed(() => created))
})
