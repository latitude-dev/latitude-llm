import type { FacetId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { findFacetPreset } from "../entities/facet-preset.ts"
import type { FacetSelection } from "../entities/facet-selection.ts"
import { FacetInvalidError } from "../errors.ts"
import { FacetRepository } from "../ports/facet-repository.ts"
import { buildFacet } from "./create-facet.ts"

export interface ResolveFacetSelectionInput {
  readonly projectId: ProjectId
  readonly facetSelection: FacetSelection
}

/**
 * Resolve a create-behavior facet selection to the facet id its scoped tree
 * gardens on (null = the global topic behavior). Runs on the ambient
 * `FacetRepository`/`SqlClient` so a caller composes it inside the create-behavior
 * transaction: a preset find-or-creates its reserved-slug row, a `newFacet`
 * validates + persists a user-authored facet, and both commit atomically with the
 * behavior insert. A raw `facetId` is returned unchecked. `createCustomBehavior`
 * validates it exists in the project.
 */
export const resolveFacetSelection = (input: ResolveFacetSelectionInput) =>
  Effect.gen(function* () {
    const { facetSelection } = input
    const noFacet: FacetId | null = null
    switch (facetSelection.kind) {
      case "topic":
        return noFacet
      case "facet":
        return facetSelection.facetId
      case "preset": {
        const preset = findFacetPreset(facetSelection.presetSlug)
        if (preset === null) {
          return yield* new FacetInvalidError({ field: "presetSlug", message: "Unknown preset" })
        }
        const repo = yield* FacetRepository
        const facet = yield* buildFacet({
          projectId: input.projectId,
          name: preset.name,
          description: preset.description,
          instructions: preset.instructions,
          slug: preset.slug,
        })
        // Find-or-create in one statement: two people picking the same never-used
        // preset at once both converge on whichever row wins the slug.
        const resolved = yield* repo.findOrCreateBySlug(facet)
        return resolved.id
      }
      case "newFacet": {
        const repo = yield* FacetRepository
        const facet = yield* buildFacet({ projectId: input.projectId, ...facetSelection.newFacet })
        yield* repo.save(facet)
        return facet.id
      }
    }
  })
