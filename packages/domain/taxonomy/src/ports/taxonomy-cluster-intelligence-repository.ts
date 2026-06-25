import type {
  ChSqlClient,
  OrganizationId,
  ProjectId,
  RepositoryError,
  TaxonomyClusterId,
  TraceId,
} from "@domain/shared"
import { Context, type Effect } from "effect"

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

export interface TaxonomyClusterIntelligenceRepositoryShape {
  getClusterAggregate(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly clusterIds: readonly TaxonomyClusterId[]
    readonly sourceWindowStart: Date
    readonly sourceWindowEnd: Date
  }): Effect.Effect<ClusterAnalysisAggregate, RepositoryError, ChSqlClient>
  listRepresentativeExamples(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly clusterIds: readonly TaxonomyClusterId[]
    readonly sourceWindowStart: Date
    readonly sourceWindowEnd: Date
    readonly limit: number
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
}

export class TaxonomyClusterIntelligenceRepository extends Context.Service<
  TaxonomyClusterIntelligenceRepository,
  TaxonomyClusterIntelligenceRepositoryShape
>()("@domain/taxonomy/TaxonomyClusterIntelligenceRepository") {}
