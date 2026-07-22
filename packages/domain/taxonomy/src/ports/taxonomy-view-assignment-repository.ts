import type {
  ChSqlClient,
  CustomBehaviorId,
  OrganizationId,
  ProjectId,
  RepositoryError,
  TaxonomyClusterId,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import type { TaxonomyMomentObservation } from "../entities/observation.ts"
import type { TaxonomyViewAssignment } from "../entities/taxonomy-view-assignment.ts"

export interface TaxonomyViewAssignmentClusterCount {
  readonly clusterId: TaxonomyClusterId
  readonly count: number
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
   * Full observation rows assigned to one scoped cluster, resolved by joining
   * the view's assignment slice back to global `taxonomy_observations` for the
   * embeddings + summaries the naming step needs. Read-only on the global table.
   */
  readonly listClusterMemberObservations: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly customBehaviorId: CustomBehaviorId
    readonly clusterId: TaxonomyClusterId
    readonly limit: number
  }) => Effect.Effect<readonly TaxonomyMomentObservation[], RepositoryError, ChSqlClient>
  /** Purge a behavior's slice when the behavior is deleted (lightweight delete). */
  readonly deleteByBehavior: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly customBehaviorId: CustomBehaviorId
  }) => Effect.Effect<void, RepositoryError, ChSqlClient>
}

export class TaxonomyViewAssignmentRepository extends Context.Service<
  TaxonomyViewAssignmentRepository,
  TaxonomyViewAssignmentRepositoryShape
>()("@domain/taxonomy/TaxonomyViewAssignmentRepository") {}
