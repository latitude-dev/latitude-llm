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
