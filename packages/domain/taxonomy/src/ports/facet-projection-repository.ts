import type {
  ChSqlClient,
  FacetId,
  FilterSet,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SessionId,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import type { TaxonomyFacetProjection } from "../entities/facet-projection.ts"

/**
 * A cached projection ready to be routed to a staging leaf — the projection-space
 * analogue of `TaxonomyReassignmentWindowObservation`, without the inline cluster
 * assignment (a facet's membership lives in `taxonomy_view_assignments`).
 *
 * `observationId` is the row's `session_observation_id`, the same session handle
 * the assignment slice keys on.
 */
export interface TaxonomyFacetProjectionWindowRow {
  readonly observationId: string
  readonly sessionId: SessionId
  readonly embedding: readonly number[]
  readonly startTime: Date
}

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
   * The full-window routing source: every clear projection cached for this facet,
   * newest first, optionally narrowed to a cohort's sessions with the same
   * `FilterSet` the sample used. Unclear projections carry no embedding and are
   * excluded — there is nothing to route them by.
   *
   * This is what lets a facet lens accumulate coverage: extraction is cached per
   * session forever, so each pass re-routes the whole cache rather than only the
   * window it just sampled.
   */
  readonly listWindowForReassignment: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly facetId: FacetId
    readonly limit: number
    readonly filterSet?: FilterSet
  }) => Effect.Effect<readonly TaxonomyFacetProjectionWindowRow[], RepositoryError, ChSqlClient>
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
