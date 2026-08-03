import type { ChSqlClient, FacetId, OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { TaxonomyFacetProjection } from "../entities/facet-projection.ts"

/**
 * ClickHouse-backed `taxonomy_facet_projections` slice — the facet-global
 * extraction cache. Projections are keyed `(org, project, facetId, sessionObservationId)`
 * and carry NO cluster assignment; per-view membership lives in
 * `taxonomy_view_assignments`. Phase 2 fills the extraction/clustering reads on
 * top of this contract.
 */
export interface FacetProjectionRepositoryShape {
  readonly upsertMany: (
    projections: readonly TaxonomyFacetProjection[],
  ) => Effect.Effect<void, RepositoryError, ChSqlClient>
  /**
   * Cache lookup — the projections already extracted for this facet, restricted
   * to `sessionObservationIds`. Phase 2 diffs the sample against these to extract
   * only the misses. Facets are immutable, so a hit is always reusable.
   */
  readonly listBySessionObservationIds: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly facetId: FacetId
    readonly sessionObservationIds: readonly string[]
  }) => Effect.Effect<readonly TaxonomyFacetProjection[], RepositoryError, ChSqlClient>
  /**
   * Cold-start health for a facet: how many sessions have been analyzed, how many
   * produced a usable answer (non-empty), and how many distinct answers there are.
   * Together these let a user judge whether their facet instructions are working:
   * a high unclear rate or a single collapsed answer signals a weak prompt.
   */
  readonly healthByFacet: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly facetId: FacetId
  }) => Effect.Effect<
    { readonly analyzed: number; readonly clear: number; readonly distinctAnswers: number },
    RepositoryError,
    ChSqlClient
  >
  /**
   * Projections that produced an answer (non-empty `extractedText`), newest
   * first, paginated: the cold-start answer list the user scrolls to review.
   * Excludes "unclear" (empty-text) projections so pagination is stable.
   */
  readonly listRecentByFacet: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly facetId: FacetId
    readonly limit: number
    readonly offset?: number
  }) => Effect.Effect<readonly TaxonomyFacetProjection[], RepositoryError, ChSqlClient>
  /** Purge a facet's projection slice when the facet is deleted. */
  readonly deleteByFacet: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly facetId: FacetId
  }) => Effect.Effect<void, RepositoryError, ChSqlClient>
}

export class FacetProjectionRepository extends Context.Service<
  FacetProjectionRepository,
  FacetProjectionRepositoryShape
>()("@domain/taxonomy/FacetProjectionRepository") {}
