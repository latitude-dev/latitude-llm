import { cuidSchema, facetIdSchema, organizationIdSchema, projectIdSchema, sessionIdSchema } from "@domain/shared"
import { z } from "zod"
import { FACET_PROJECTION_TEXT_MAX_LENGTH } from "../constants.ts"

/**
 * A session's projection under one facet: the extracted one-sentence answer plus
 * its embedding. Unlike topic projections (the live transcript embedding on
 * `taxonomy_observations`), facet projections are produced lazily at gardening
 * and live in the ClickHouse `taxonomy_facet_projections` slice.
 *
 * A facet projection is **facet-global** — extracted once per `(facet, session)`
 * and shared by every view that samples the session — so it carries NO inline
 * cluster assignment. Membership is a per-view edge in `taxonomy_view_assignments`.
 * The cache key is `(sessionId, facetId)`; facets are immutable, so a facet's
 * projections never need invalidating.
 *
 * `sessionObservationId` is the session's per-session taxonomy id (the same value
 * `taxonomy_observations` uses for that session), reused here as the session
 * handle — not a foreign key (ClickHouse has none).
 */
export const taxonomyFacetProjectionSchema = z.object({
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  facetId: facetIdSchema,
  sessionObservationId: cuidSchema,
  sessionId: sessionIdSchema,
  extractedText: z.string().max(FACET_PROJECTION_TEXT_MAX_LENGTH),
  analysisHash: z.string().length(64),
  embedding: z.array(z.number()),
  startTime: z.date(),
  retentionDays: z.number().int().positive(),
  indexedAt: z.date(),
})

export type TaxonomyFacetProjection = z.infer<typeof taxonomyFacetProjectionSchema>
