import type {
  CustomBehaviorId,
  FacetId,
  NotFoundError,
  ProjectId,
  RepositoryError,
  SqlClient,
  TaxonomyClusterId,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import type { TaxonomyDimension } from "../entities/dimension.ts"

export interface NearestClusterMatch {
  readonly cluster: TaxonomyCluster
  /** Cosine similarity, already normalized to 0..1. */
  readonly cosine: number
}

export interface TaxonomyClusterSearchCandidate {
  readonly clusterId: TaxonomyClusterId
  readonly name: string
  readonly description: string
  readonly score: number
}

export type TaxonomyClusterSort = "observation_count_desc" | "last_observed_desc" | "name_asc"

export interface ListClustersInput {
  readonly projectId: ProjectId
  readonly dimension: TaxonomyDimension
  readonly state?: TaxonomyCluster["state"]
  readonly sort?: TaxonomyClusterSort
  readonly limit: number
  readonly offset: number
  /** Omit/null = whole-project scope (custom_behavior_id IS NULL); an id scopes to that behavior's sub-tree. */
  readonly customBehaviorId?: CustomBehaviorId | null
  /** Omit/null = topic (facet_id IS NULL); an id scopes to that facet's tree. */
  readonly facetId?: FacetId | null
}

export interface TaxonomyClusterListPage {
  readonly items: readonly TaxonomyCluster[]
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

export interface MarkMergedInput {
  readonly clusterId: TaxonomyClusterId
  readonly mergedIntoClusterId: TaxonomyClusterId
  readonly timestamp: Date
}

export interface TaxonomyClusterRepositoryShape {
  findById(id: TaxonomyClusterId): Effect.Effect<TaxonomyCluster, NotFoundError | RepositoryError, SqlClient>
  listByIds(ids: readonly TaxonomyClusterId[]): Effect.Effect<readonly TaxonomyCluster[], RepositoryError, SqlClient>
  listActiveByProject(input: {
    readonly projectId: ProjectId
    readonly dimension: TaxonomyDimension
    /** Omit for all nodes; null for roots; an id for that node's children. */
    readonly parentClusterId?: TaxonomyClusterId | null
    /** Omit/null = whole-project scope (custom_behavior_id IS NULL); an id scopes to that behavior's sub-tree. */
    readonly customBehaviorId?: CustomBehaviorId | null
    /** Omit/null = topic (facet_id IS NULL); an id scopes to that facet's tree. */
    readonly facetId?: FacetId | null
  }): Effect.Effect<readonly TaxonomyCluster[], RepositoryError, SqlClient>
  /** Active ids of the node plus all its descendants (path prefix match). */
  listSubtreeIds(input: {
    readonly projectId: ProjectId
    readonly clusterId: TaxonomyClusterId
    /** Omit/null = whole-project scope (custom_behavior_id IS NULL); an id scopes to that behavior's sub-tree. */
    readonly customBehaviorId?: CustomBehaviorId | null
    /** Omit/null = topic (facet_id IS NULL); an id scopes to that facet's tree. */
    readonly facetId?: FacetId | null
  }): Effect.Effect<readonly TaxonomyClusterId[], RepositoryError, SqlClient>
  /**
   * WHOLE-PROJECT TOPIC TREE ONLY (`custom_behavior_id IS NULL AND facet_id IS
   * NULL`). This is the online router's read: only that one tree is
   * live-assigned, so it must never return a cohort or facet cluster — those are
   * gardening-only and their membership is written to `taxonomy_view_assignments`
   * at garden time, never by online routing.
   *
   * Exact pgvector cosine over `(organization_id, project_id)` for state =
   * 'active' clusters with a non-null `centroid_embedding`. Sub-ms at the
   * cluster counts this product runs at (hundreds to low-thousands per
   * project). Order is unspecified — callers that need ranked results must
   * sort by `cosine`.
   */
  listNearestActive(input: {
    readonly projectId: ProjectId
    readonly dimension: TaxonomyDimension
    readonly queryVector: readonly number[]
    readonly k: number
    /** Omit for all nodes; null for roots; an id for that node's children. */
    readonly parentClusterId?: TaxonomyClusterId | null
  }): Effect.Effect<readonly NearestClusterMatch[], RepositoryError, SqlClient>
  /**
   * WHOLE-PROJECT TOPIC TREE ONLY (`custom_behavior_id IS NULL AND facet_id IS
   * NULL`) — cluster search over the online-routed tree. Cohort and facet trees
   * are not searchable through this method; scope-aware browse goes through `list`.
   */
  hybridSearch(input: {
    readonly projectId: ProjectId
    readonly dimension: TaxonomyDimension
    readonly query: string
    readonly normalizedEmbedding: readonly number[]
    readonly state?: TaxonomyCluster["state"]
    readonly limit: number
    readonly offset: number
  }): Effect.Effect<readonly TaxonomyClusterSearchCandidate[], RepositoryError, SqlClient>
  list(input: ListClustersInput): Effect.Effect<TaxonomyClusterListPage, RepositoryError, SqlClient>
  /**
   * Persist the cluster row, materializing the derived `centroid_embedding`
   * column from the JSONB centroid inside the repository (same pattern as
   * `SignalRepository.save`).
   */
  save(cluster: TaxonomyCluster): Effect.Effect<void, RepositoryError, SqlClient>
  markMerged(input: MarkMergedInput): Effect.Effect<void, RepositoryError, SqlClient>
  markDeprecated(input: {
    readonly clusterId: TaxonomyClusterId
    readonly timestamp: Date
  }): Effect.Effect<void, RepositoryError, SqlClient>
  /**
   * Atomic tree publish. In one transaction, deprecate exactly
   * `supersededClusterIds` (the old active tree) and activate
   * `stagingClusterIds` (the freshly built + assigned staging tree). Active
   * reads therefore never observe the old and new trees simultaneously.
   * Idempotent: activating already-active staging rows and deprecating
   * already-deprecated rows are no-ops, so an activity retry re-runs safely.
   */
  swapActiveTree(input: {
    readonly supersededClusterIds: readonly TaxonomyClusterId[]
    readonly stagingClusterIds: readonly TaxonomyClusterId[]
    readonly timestamp: Date
  }): Effect.Effect<void, RepositoryError, SqlClient>
  /**
   * Remove abandoned staging rows on a failed publish, leaving the old tree
   * active. Guarded to `state = 'staging'` so it can never delete a live tree.
   */
  deleteStaging(input: {
    readonly clusterIds: readonly TaxonomyClusterId[]
  }): Effect.Effect<void, RepositoryError, SqlClient>
  /**
   * Drop a scoped tree outright when its behavior is deleted, whatever state its
   * nodes are in. Takes a required `customBehaviorId` rather than the usual
   * omit-for-whole-project optional: the `(NULL, NULL)` tree is the live
   * online-routed one, and this is the only method here that deletes active rows,
   * so it must be impossible to aim at it.
   */
  deleteByBehavior(input: {
    readonly projectId: ProjectId
    readonly customBehaviorId: CustomBehaviorId
  }): Effect.Effect<void, RepositoryError, SqlClient>
}

export class TaxonomyClusterRepository extends Context.Service<
  TaxonomyClusterRepository,
  TaxonomyClusterRepositoryShape
>()("@domain/taxonomy/TaxonomyClusterRepository") {}
