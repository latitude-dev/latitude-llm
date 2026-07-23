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
  FacetInvalidError,
} from "../errors.ts"
import { CustomBehaviorRepository } from "../ports/custom-behavior-repository.ts"
import { FacetRepository } from "../ports/facet-repository.ts"
import { generateCustomBehavior } from "./generate-custom-behavior.ts"

export interface CreateCustomBehaviorInput {
  readonly id?: CustomBehaviorId
  readonly projectId: ProjectId
  readonly name: string
  readonly filterSet: FilterSet
  /** The lens: omit/null = topic (needs a filter); an id = a facet (empty filter allowed). */
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
  // Only invalid shape is a topic lens with no filter (that's the live global tree).
  if (input.facetId == null && !customBehaviorFilterSetHasConditions(parsedFilterSet.data)) {
    return yield* new CustomBehaviorFilterInvalidError({ message: CUSTOM_BEHAVIOR_EMPTY_FILTER_MESSAGE })
  }

  const sqlClient = yield* SqlClient
  const created = yield* sqlClient.transaction(
    Effect.gen(function* () {
      const repo = yield* CustomBehaviorRepository

      // A facet-backed view must reference a lens that exists in THIS project, or its
      // auto-started garden would fail at `FacetRepository.findById` and a same-org
      // cross-project facet would garden under mismatched project ids. findById is
      // org-scoped (RLS), so a missing/cross-org id already surfaces as null here.
      if (input.facetId != null) {
        const facets = yield* FacetRepository
        const facet = yield* facets.findById(input.facetId).pipe(Effect.orElseSucceed(() => null))
        if (facet === null || facet.projectId !== input.projectId) {
          return yield* new FacetInvalidError({ field: "facetId", message: "Facet not found in this project" })
        }
      }

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
