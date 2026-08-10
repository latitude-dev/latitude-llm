import type {
  ChSqlClient,
  CustomBehaviorId,
  FacetId,
  OrganizationId,
  ProjectId,
  RepositoryError,
  TaxonomyClusterId,
  TraceId,
} from "@domain/shared"
import { Context, type Effect } from "effect"

/**
 * A scoped view's facet id, threaded beside `customBehaviorId` into every
 * intelligence read so the `taxonomy_view_assignments` membership matches the
 * right slice: omit/null = the view's topic edges; a facet id = that facet's
 * edges. The edges resolve back to the same session observation in
 * `taxonomy_observations`, so a facet drawer gets identical moment/score rollups.
 */

/**
 * Moment-turn range filter for the cluster session list. `metric` selects which
 * moment kinds count (frequency = any, escalation, resolution, churnRisk,
 * wins); `fromTurn`/`toTurn` bound the conversation turn at which the moment
 * appears. Mirrors the Behaviours drawer's turn-range slider.
 */
export interface ClusterSessionMomentRange {
  readonly metric: string
  readonly fromTurn: number
  readonly toTurn: number
}

export interface ClusterSessionTraceIdsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly clusterIds: readonly TaxonomyClusterId[]
  /** "all" or a single moment kind the session must contain. */
  readonly filter: string
  readonly momentRange?: ClusterSessionMomentRange
  readonly startTimeFrom?: Date
  readonly startTimeTo?: Date
  readonly limit: number
  /** Omit/null = global taxonomy; an id resolves membership from that behavior's scoped assignment slice. */
  readonly customBehaviorId?: CustomBehaviorId | null
  /** The scoped view's facet; omit/null = topic edges, a facet id = that facet's edges. */
  readonly facetId?: FacetId | null
}

export interface ClusterAnalysisAggregate {
  readonly sourceObservationCount: number
  readonly sourceSessionCount: number
  readonly sourceAnalysisCount: number
  readonly sourceAnalysisCoverage: number
  readonly momentKindDistribution: Readonly<Record<string, number>>
  readonly eligibleSessionCount: number
  readonly skippedCount: number
  readonly failedCount: number
}

export interface ClusterRepresentativeExample {
  readonly sessionId: string
  readonly summary: string
}

export interface ClusterSessionRow {
  readonly sessionId: string
  readonly traceId: string
  /** First semantic moment linking the session to the cluster (or, with a
   * momentRange, the earliest moment matching that metric/turn window). */
  readonly momentId: string
  readonly summary: string
  readonly startTime: Date
  readonly endTime: Date
  readonly momentKinds: readonly string[]
}

export interface ClusterSessionHistogramBucket {
  readonly startTime: Date
  readonly count: number
}

export interface ClusterSessionsPage {
  readonly sessions: readonly ClusterSessionRow[]
  /** Session counts bucketed over the whole filtered set (not just this page). */
  readonly histogram: readonly ClusterSessionHistogramBucket[]
  readonly hasMore: boolean
  readonly nextOffset: number | null
}

export interface ListClusterSessionsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly clusterIds: readonly TaxonomyClusterId[]
  /** "all" or a single moment kind the session must contain. */
  readonly filter: string
  readonly momentRange?: ClusterSessionMomentRange
  readonly startTimeFrom?: Date
  readonly startTimeTo?: Date
  readonly offset: number
  readonly limit: number
  /** Omit/null = global taxonomy; an id reads the scoped assignment slice. */
  readonly customBehaviorId?: CustomBehaviorId | null
  /** The scoped view's facet; omit/null = topic edges, a facet id = that facet's edges. */
  readonly facetId?: FacetId | null
}

export type ClusterTrajectoryAxis = "day" | "turn"

export interface ClusterTrajectoryRow {
  readonly bucket: string
  readonly frequency: number
  readonly escalation: number
  readonly resolution: number
  readonly churnRisk: number
  readonly wins: number
  readonly maxLastMessageIndex: number
  readonly maxEscalationLastMessageIndex: number
  readonly maxResolutionLastMessageIndex: number
  readonly maxChurnRiskLastMessageIndex: number
  readonly maxWinsLastMessageIndex: number
}

export interface GetClusterTrajectoryInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly clusterIds: readonly TaxonomyClusterId[]
  readonly axis: ClusterTrajectoryAxis
  readonly startTimeFrom?: Date
  readonly startTimeTo?: Date
  readonly customBehaviorId?: CustomBehaviorId | null
  /** The scoped view's facet; omit/null = topic edges, a facet id = that facet's edges. */
  readonly facetId?: FacetId | null
}

export interface TaxonomyClusterIntelligenceRepositoryShape {
  getClusterAggregate(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly clusterIds: readonly TaxonomyClusterId[]
    readonly sourceWindowStart: Date
    readonly sourceWindowEnd: Date
    /** Omit/null = global taxonomy; an id reads the scoped assignment slice. */
    readonly customBehaviorId?: CustomBehaviorId | null
    /** The scoped view's facet; omit/null = topic edges, a facet id = that facet's edges. */
    readonly facetId?: FacetId | null
  }): Effect.Effect<ClusterAnalysisAggregate, RepositoryError, ChSqlClient>
  listRepresentativeExamples(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly clusterIds: readonly TaxonomyClusterId[]
    readonly sourceWindowStart: Date
    readonly sourceWindowEnd: Date
    readonly limit: number
    /** Omit/null = global taxonomy; an id reads the scoped assignment slice. */
    readonly customBehaviorId?: CustomBehaviorId | null
    /** The scoped view's facet; omit/null = topic edges, a facet id = that facet's edges. */
    readonly facetId?: FacetId | null
  }): Effect.Effect<readonly ClusterRepresentativeExample[], RepositoryError, ChSqlClient>
  /**
   * One trace id per session assigned to the cluster subtree, scoped by the
   * same moment-kind / turn-range / time filters the Behaviours drawer exposes.
   * Picks each session's first trace (the trace the Behaviours table links to).
   * Used to feed cluster sessions into a dataset.
   */
  listSessionTraceIds(
    input: ClusterSessionTraceIdsInput,
  ): Effect.Effect<readonly TraceId[], RepositoryError, ChSqlClient>
  /**
   * One page of sessions assigned to the cluster subtree (plus a histogram over
   * the whole filtered set), honouring the Behaviours drawer's moment-kind /
   * turn-range / time filters. Backs the drawer's session list.
   */
  listClusterSessions(input: ListClusterSessionsInput): Effect.Effect<ClusterSessionsPage, RepositoryError, ChSqlClient>
  /**
   * Per-bucket moment-metric counts for a cluster subtree over the day or turn
   * axis. Backs the Behaviours trajectory chart (one call per category subtree).
   */
  getClusterTrajectory(
    input: GetClusterTrajectoryInput,
  ): Effect.Effect<readonly ClusterTrajectoryRow[], RepositoryError, ChSqlClient>
}

export class TaxonomyClusterIntelligenceRepository extends Context.Service<
  TaxonomyClusterIntelligenceRepository,
  TaxonomyClusterIntelligenceRepositoryShape
>()("@domain/taxonomy/TaxonomyClusterIntelligenceRepository") {}
