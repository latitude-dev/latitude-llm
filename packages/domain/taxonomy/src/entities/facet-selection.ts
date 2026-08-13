import { facetIdSchema } from "@domain/shared"
import { z } from "zod"
import { taxonomyFacetSchema } from "./facet.ts"

/** The three author-supplied fields of an inline user-authored facet; reuses the facet entity's field validation. */
export const newFacetInputSchema = taxonomyFacetSchema.pick({ name: true, description: true, instructions: true })
export type NewFacetInput = z.infer<typeof newFacetInputSchema>

/**
 * The facet a +behavior create picks, resolved server-side to a `facetId | null`
 * before it reaches `createCustomBehavior`:
 *  - `topic`: the global topic behavior (null facet; requires a non-empty filter).
 *  - `facet`: an existing project facet, by id.
 *  - `preset`: a reserved `lat-` catalog slug, find-or-created on first pick.
 *  - `newFacet`: an inline user-authored facet, validated + created.
 */
export const facetSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("topic") }),
  z.object({ kind: z.literal("facet"), facetId: facetIdSchema }),
  z.object({ kind: z.literal("preset"), presetSlug: z.string().min(1) }),
  z.object({ kind: z.literal("newFacet"), newFacet: newFacetInputSchema }),
])
export type FacetSelection = z.infer<typeof facetSelectionSchema>
