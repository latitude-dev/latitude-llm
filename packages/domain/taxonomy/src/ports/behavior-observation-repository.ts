import type {
  ChSqlClient,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SessionId,
  TaxonomyClusterId,
  TaxonomyRunId,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import type { TaxonomyObservation } from "../entities/observation.ts"

export interface ListNoiseInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** Inclusive lower bound on `start_time`. */
  readonly since: Date
  /** Optional cap on the noise pool size pulled into the births pass. */
  readonly limit?: number
}

export interface ListObservationsInClusterInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly clusterId: TaxonomyClusterId
  readonly limit: number
  /** Compound cursor for stable `(start_time DESC, session_id ASC)` pagination. */
  readonly beforeStartTime?: Date
  readonly beforeSessionId?: SessionId
}

/**
 * Counts over the `[since, now]` window passed to `getCounts` — not lifetime
 * totals. Aggregated after the `FINAL` collapse so each session contributes
 * at most once even if multiple unmerged rows still exist.
 */
export interface BehaviorObservationCounts {
  readonly total: number
  readonly assigned: number
  readonly noise: number
}

export interface BehaviorObservationClusterOccurrence {
  readonly clusterId: TaxonomyClusterId
  readonly count: number
}

export interface BehaviorObservationClusterTrendCounts {
  readonly clusterId: TaxonomyClusterId
  readonly currentCount: number
  readonly baselineCount: number
  readonly baselineDays: number
}

export interface ReassignObservationInput {
  readonly observation: TaxonomyObservation
  readonly assignedClusterId: TaxonomyClusterId
  readonly assignmentMethod: TaxonomyObservation["assignmentMethod"]
  readonly assignmentConfidence: number
  readonly reassignmentRunId: TaxonomyRunId
  readonly indexedAt: Date
}

export interface BehaviorObservationRepositoryShape {
  /** Upsert one observation row (latest version wins via `ReplacingMergeTree`). */
  upsert(observation: TaxonomyObservation): Effect.Effect<void, RepositoryError, ChSqlClient>
  /** Bulk reassign — used by gardening births / merges / reassignment passes. */
  reassignMany(inputs: readonly ReassignObservationInput[]): Effect.Effect<void, RepositoryError, ChSqlClient>
  listNoise(input: ListNoiseInput): Effect.Effect<readonly TaxonomyObservation[], RepositoryError, ChSqlClient>
  listByCluster(
    input: ListObservationsInClusterInput,
  ): Effect.Effect<readonly TaxonomyObservation[], RepositoryError, ChSqlClient>
  /**
   * Internal gardening path that needs every observation attached to a
   * cluster, without a timestamp-only cursor. Pass a hard `limit` (typically
   * `TAXONOMY_LIST_ALL_BY_CLUSTER_MAX` for merge, smaller for sampling
   * paths) so a runaway cluster doesn't return tens of thousands of rows.
   */
  listAllByCluster(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly clusterId: TaxonomyClusterId
    readonly limit: number
  }): Effect.Effect<readonly TaxonomyObservation[], RepositoryError, ChSqlClient>
  /**
   * Lookup an existing row by `(orgId, projectId, sessionId, summaryHash)`
   * — used by the LLM-summary cache path.
   */
  findBySummaryHash(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionId: SessionId
    readonly summaryHash: string
  }): Effect.Effect<TaxonomyObservation | null, RepositoryError, ChSqlClient>
  getCounts(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly since: Date
  }): Effect.Effect<BehaviorObservationCounts, RepositoryError, ChSqlClient>
  getTopClustersByOccurrence(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly since: Date
    readonly limit: number
  }): Effect.Effect<readonly BehaviorObservationClusterOccurrence[], RepositoryError, ChSqlClient>
  getClusterTrendCounts(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly clusterIds: readonly TaxonomyClusterId[]
    readonly currentSince: Date
    readonly baselineSince: Date
    readonly baselineDays: number
  }): Effect.Effect<readonly BehaviorObservationClusterTrendCounts[], RepositoryError, ChSqlClient>
}

export class BehaviorObservationRepository extends Context.Service<
  BehaviorObservationRepository,
  BehaviorObservationRepositoryShape
>()("@domain/taxonomy/BehaviorObservationRepository") {}
