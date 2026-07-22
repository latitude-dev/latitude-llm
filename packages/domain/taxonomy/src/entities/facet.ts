import { facetIdSchema, organizationIdSchema, projectIdSchema, SLUG_MAX_LENGTH } from "@domain/shared"
import { z } from "zod"
import {
  FACET_DESCRIPTION_MAX_LENGTH,
  FACET_INSTRUCTIONS_MAX_LENGTH,
  FACET_NAME_MAX_LENGTH,
  FACET_STATUSES,
} from "../constants.ts"

// ---------------------------------------------------------------------------
// FacetStatus
// ---------------------------------------------------------------------------

export const facetStatusSchema = z.enum(FACET_STATUSES)
export type FacetStatus = z.infer<typeof facetStatusSchema>

export const FacetStatus = {
  Pending: "pending",
  Generating: "generating",
  Ready: "ready",
  Failed: "failed",
} as const satisfies Record<string, FacetStatus>

// ---------------------------------------------------------------------------
// TaxonomyFacet
// ---------------------------------------------------------------------------

/**
 * A project-scoped lens, addressed by a `slug` unique per project so a single
 * facet is reused across every view that picks it (whole-project + each cohort),
 * which is what keeps extraction cost bounded per facet.
 *
 * `instructions` is free-text guidance compiled into a controlled extraction
 * prompt (Phase 2) whose one-sentence answer is embedded and clustered instead
 * of the raw transcript; it is **write-once** — to change what a lens means you
 * create a new facet, never mutate this one. `name` + `description` are
 * presentation (the picker label and the "why this lens helps" blurb) and stay
 * editable. Presets ship curated instructions/description; custom facets author
 * both.
 */
export const taxonomyFacetSchema = z.object({
  id: facetIdSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  slug: z.string().min(1).max(SLUG_MAX_LENGTH),
  name: z.string().min(1).max(FACET_NAME_MAX_LENGTH),
  description: z.string().min(1).max(FACET_DESCRIPTION_MAX_LENGTH),
  instructions: z.string().min(1).max(FACET_INSTRUCTIONS_MAX_LENGTH),
  status: facetStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type TaxonomyFacet = z.infer<typeof taxonomyFacetSchema>
