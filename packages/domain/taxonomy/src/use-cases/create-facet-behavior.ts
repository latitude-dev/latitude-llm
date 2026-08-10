import type { ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { type CustomBehavior, customBehaviorFilterSetHasConditions } from "../entities/custom-behavior.ts"
import { findFacetPreset } from "../entities/facet-preset.ts"
import type { FacetSelection } from "../entities/facet-selection.ts"
import { FacetInvalidError } from "../errors.ts"
import { CustomBehaviorRepository } from "../ports/custom-behavior-repository.ts"
import { FacetRepository } from "../ports/facet-repository.ts"
import { createCustomBehavior } from "./create-custom-behavior.ts"

export interface CreateFacetBehaviorInput {
  readonly projectId: ProjectId
  /** A `preset` (find-or-create by reserved slug) or a `newFacet` (inline authored). */
  readonly facetSelection: FacetSelection
}

/**
 * Create a facet behavior and materialize it as its whole-project view. A facet
 * behavior has no tree of its own. Its tree is a custom behavior with an empty
 * filter over the facet, gardened whole-project (the review surface). Filtered
 * views are then just more custom behaviors on the same facet. Picking a preset
 * that already has a whole-project view returns that view instead of a duplicate.
 */
export const createFacetBehavior = (input: CreateFacetBehaviorInput) =>
  Effect.gen(function* () {
    const { facetSelection } = input
    if (facetSelection.kind !== "preset" && facetSelection.kind !== "newFacet") {
      return yield* new FacetInvalidError({
        field: "facetSelection",
        message: "A new behavior is a preset or a custom facet",
      })
    }

    if (facetSelection.kind === "preset") {
      const preset = findFacetPreset(facetSelection.presetSlug)
      if (preset === null) {
        return yield* new FacetInvalidError({ field: "presetSlug", message: "Unknown preset" })
      }
      // A preset is find-or-created by slug; if its whole-project view already
      // exists, reuse it rather than spawning a second identical tree.
      const facets = yield* FacetRepository
      const facet = yield* facets.findBySlug({ projectId: input.projectId, slug: preset.slug })
      if (facet !== null) {
        const repo = yield* CustomBehaviorRepository
        const behaviors = yield* repo.listByProject({ projectId: input.projectId })
        const existing = behaviors.find(
          (behavior) => behavior.facetId === facet.id && !customBehaviorFilterSetHasConditions(behavior.filterSet),
        )
        if (existing !== undefined) return existing satisfies CustomBehavior
      }
      return yield* createCustomBehavior({
        projectId: input.projectId,
        name: preset.name,
        filterSet: {},
        facetSelection,
      })
    }

    return yield* createCustomBehavior({
      projectId: input.projectId,
      name: facetSelection.newFacet.name,
      filterSet: {},
      facetSelection,
    })
  })
