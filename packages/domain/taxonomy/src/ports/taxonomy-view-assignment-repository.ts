import type {
  ChSqlClient,
  CustomBehaviorId,
  FacetId,
  OrganizationId,
  ProjectId,
  RepositoryError,
  TaxonomyClusterId,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import type { TaxonomyViewAssignment } from "../entities/taxonomy-view-assignment.ts"

export interface TaxonomyViewAssignmentClusterCount {
  readonly clusterId: TaxonomyClusterId
  readonly count: number
}

/**
 * The slim member row cluster naming needs: an embedding for farthest-point
 * sampling, a `startTime` for recency ranking, and the readable text in
 * `projectionMetadata.summary`. Topic members carry the full transcript summary
 * from `taxonomy_observations`; facet members carry the extracted one-sentence
 * answer from `taxonomy_facet_projections`. `TaxonomyMomentObservation` is
 * structurally assignable, so the topic read returns full rows unchanged.
 */
export interface TaxonomyClusterNamingMember {
  readonly embedding: readonly number[]
  readonly startTime: Date
  readonly projectionMetadata: Readonly<Record<string, unknown>>
}

/**
 * Per-cluster current-vs-baseline counts over `taxonomy_view_assignments.start_time`.
 * Same shape the global `TaxonomyObservationRepository.getClusterTrendCounts`
 * returns, so both feed `classifyClusterTrend` identically.
 */
export interface TaxonomyViewAssignmentClusterTrendCount {
  readonly clusterId: TaxonomyClusterId
  readonly currentCount: number
  readonly baselineCount: number
  readonly baselineDays: number
}

/**
 * ClickHouse-backed `taxonomy_view_assignments` slice — the shared edges table
 * for every non-online tree. It never touches global
 * `taxonomy_observations.assigned_cluster_id`. These reads target the topic slice
 * (`facet_id = ''`); the facet reads are wired in a later phase.
 */
export interface TaxonomyViewAssignmentRepositoryShape {
  readonly upsertMany: (
    assignments: readonly TaxonomyViewAssignment[],
  ) => Effect.Effect<void, RepositoryError, ChSqlClient>
  readonly listByBehavior: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly customBehaviorId: CustomBehaviorId
    readonly limit: number
  }) => Effect.Effect<readonly TaxonomyViewAssignment[], RepositoryError, ChSqlClient>
  readonly getClusterAssignmentCounts: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly customBehaviorId: CustomBehaviorId
    /** Optional window over `start_time`; omit for the whole retained slice. */
    readonly startTimeFrom?: Date
    readonly startTimeTo?: Date
  }) => Effect.Effect<readonly TaxonomyViewAssignmentClusterCount[], RepositoryError, ChSqlClient>
  /**
   * Current-vs-baseline per-cluster counts windowed over
   * `taxonomy_view_assignments.start_time` — the scoped mirror of the global
   * `getClusterTrendCounts`. Because scoped gardening accumulates rows across
   * runs (ReplacingMergeTree, no truncate) and keeps stable cluster ids via the
   * Hungarian lineage matcher, these deltas carry born/continue/die trend just
   * like the global tree.
   */
  readonly getClusterTrendCounts: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly customBehaviorId: CustomBehaviorId
    readonly clusterIds: readonly TaxonomyClusterId[]
    readonly currentSince: Date
    readonly baselineSince: Date
    readonly baselineDays: number
  }) => Effect.Effect<readonly TaxonomyViewAssignmentClusterTrendCount[], RepositoryError, ChSqlClient>
  /**
   * Member rows of one scoped cluster for the naming step, resolved by joining
   * the view's assignment slice back to the projection source: the topic lens
   * (`facetId` omitted/null) reads global `taxonomy_observations`; a facet lens
   * reads `taxonomy_facet_projections`. Read-only on both source tables.
   */
  readonly listClusterMemberObservations: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly customBehaviorId: CustomBehaviorId
    /** Omit/null = topic lens (members from `taxonomy_observations`); an id reads `taxonomy_facet_projections`. */
    readonly facetId?: FacetId | null
    readonly clusterId: TaxonomyClusterId
    readonly limit: number
  }) => Effect.Effect<readonly TaxonomyClusterNamingMember[], RepositoryError, ChSqlClient>
  /**
   * Purge a scope's edges when the entity is deleted. `deleteByBehavior` drops
   * every edge for a cohort across BOTH lenses — its topic slice AND each facet
   * lens applied to it — so deleting a cohort never orphans facet-lens edges.
   */
  readonly deleteByBehavior: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly customBehaviorId: CustomBehaviorId
  }) => Effect.Effect<void, RepositoryError, ChSqlClient>
  /** Purge a facet's edges across every scope when the facet is deleted. */
  readonly deleteByFacet: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly facetId: FacetId
  }) => Effect.Effect<void, RepositoryError, ChSqlClient>
}

export class TaxonomyViewAssignmentRepository extends Context.Service<
  TaxonomyViewAssignmentRepository,
  TaxonomyViewAssignmentRepositoryShape
>()("@domain/taxonomy/TaxonomyViewAssignmentRepository") {}
