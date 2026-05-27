import type { NotFoundError, ProjectId, RepositoryError, SqlClient, TaxonomyClusterId } from "@domain/shared"
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
  }): Effect.Effect<readonly TaxonomyCluster[], RepositoryError, SqlClient>
  /** Active ids of the node plus all its descendants (path prefix match). */
  listSubtreeIds(input: {
    readonly projectId: ProjectId
    readonly clusterId: TaxonomyClusterId
  }): Effect.Effect<readonly TaxonomyClusterId[], RepositoryError, SqlClient>
  /**
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
   * `IssueRepository.save`).
   */
  save(cluster: TaxonomyCluster): Effect.Effect<void, RepositoryError, SqlClient>
  markMerged(input: MarkMergedInput): Effect.Effect<void, RepositoryError, SqlClient>
  markDeprecated(input: {
    readonly clusterId: TaxonomyClusterId
    readonly timestamp: Date
  }): Effect.Effect<void, RepositoryError, SqlClient>
}

export class TaxonomyClusterRepository extends Context.Service<
  TaxonomyClusterRepository,
  TaxonomyClusterRepositoryShape
>()("@domain/taxonomy/TaxonomyClusterRepository") {}
