import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError, TaxonomyClusterId } from "@domain/shared"
import { Context, type Effect } from "effect"

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
}

export class TaxonomyClusterIntelligenceRepository extends Context.Service<
  TaxonomyClusterIntelligenceRepository,
  TaxonomyClusterIntelligenceRepositoryShape
>()("@domain/taxonomy/TaxonomyClusterIntelligenceRepository") {}
