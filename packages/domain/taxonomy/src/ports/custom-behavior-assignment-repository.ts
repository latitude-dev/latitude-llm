import type {
  ChSqlClient,
  CustomBehaviorId,
  OrganizationId,
  ProjectId,
  RepositoryError,
  TaxonomyClusterId,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import type { CustomBehaviorAssignment } from "../entities/custom-behavior-assignment.ts"
import type { TaxonomyMomentObservation } from "../entities/observation.ts"

export interface CustomBehaviorAssignmentClusterCount {
  readonly clusterId: TaxonomyClusterId
  readonly count: number
}

/**
 * ClickHouse-backed `custom_behavior_assignments` slice — the shared boundary
 * Phase 2 writes and Phase 3 reads. It never touches global
 * `taxonomy_observations.assigned_cluster_id`.
 */
export interface CustomBehaviorAssignmentRepositoryShape {
  readonly upsertMany: (
    assignments: readonly CustomBehaviorAssignment[],
  ) => Effect.Effect<void, RepositoryError, ChSqlClient>
  readonly listByBehavior: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly customBehaviorId: CustomBehaviorId
    readonly limit: number
  }) => Effect.Effect<readonly CustomBehaviorAssignment[], RepositoryError, ChSqlClient>
  readonly getClusterAssignmentCounts: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly customBehaviorId: CustomBehaviorId
  }) => Effect.Effect<readonly CustomBehaviorAssignmentClusterCount[], RepositoryError, ChSqlClient>
  /**
   * Full observation rows assigned to one scoped cluster, resolved by joining
   * the behavior's assignment slice back to global `taxonomy_observations` for
   * the embeddings + summaries the naming step needs. Read-only on the global
   * table.
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

export class CustomBehaviorAssignmentRepository extends Context.Service<
  CustomBehaviorAssignmentRepository,
  CustomBehaviorAssignmentRepositoryShape
>()("@domain/taxonomy/CustomBehaviorAssignmentRepository") {}
