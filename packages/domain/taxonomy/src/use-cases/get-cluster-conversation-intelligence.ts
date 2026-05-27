import type { OrganizationId, ProjectId, TaxonomyClusterId } from "@domain/shared"
import { Effect } from "effect"
import type {
  ClusterAnalysisAggregate,
  ClusterRepresentativeExample,
} from "../ports/taxonomy-cluster-intelligence-repository.ts"
import { TaxonomyClusterIntelligenceRepository } from "../ports/taxonomy-cluster-intelligence-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"

export interface GetClusterConversationIntelligenceInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly clusterId: TaxonomyClusterId
  readonly now?: Date
  readonly sourceWindowDays?: number
}

export interface GetClusterConversationIntelligenceResult {
  readonly aggregate: ClusterAnalysisAggregate
  readonly representativeExamples: readonly ClusterRepresentativeExample[]
  readonly topMoments: readonly { readonly kind: string; readonly count: number }[]
  readonly rates: {
    readonly analysisCoverage: number
    readonly resolutionRate: number
    readonly escalationRate: number
    readonly frustrationRate: number
  }
}

const DEFAULT_SOURCE_WINDOW_DAYS = 30
const rate = (count: number, denominator: number): number => (denominator <= 0 ? 0 : count / denominator)
const countOf = (distribution: Readonly<Record<string, number>>, key: string): number => distribution[key] ?? 0

export const getClusterConversationIntelligenceUseCase = (input: GetClusterConversationIntelligenceInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.clusterId", input.clusterId)
    const queryStartedAt = Date.now()
    const now = input.now ?? new Date()
    const sourceWindowEnd = now
    const sourceWindowStart = new Date(
      now.getTime() - (input.sourceWindowDays ?? DEFAULT_SOURCE_WINDOW_DAYS) * 24 * 60 * 60_000,
    )
    const intelligence = yield* TaxonomyClusterIntelligenceRepository
    const clusters = yield* TaxonomyClusterRepository
    // A tree node's profile covers its whole subtree: interior nodes hold
    // only residue directly, but represent every session routed below them —
    // matching the subtree-scoped session list shown next to this profile.
    const clusterIds = yield* clusters.listSubtreeIds({ projectId: input.projectId, clusterId: input.clusterId })
    const aggregate = yield* intelligence.getClusterAggregate({
      organizationId: input.organizationId,
      projectId: input.projectId,
      clusterIds,
      sourceWindowStart,
      sourceWindowEnd,
    })
    const representativeExamples = yield* intelligence.listRepresentativeExamples({
      organizationId: input.organizationId,
      projectId: input.projectId,
      clusterIds,
      sourceWindowStart,
      sourceWindowEnd,
      limit: 10,
    })
    const conversationDenominator = aggregate.conversationEligibleSessionCount
    const queryLatencyMs = Date.now() - queryStartedAt
    yield* Effect.logDebug("Loaded cluster conversation intelligence", {
      projectId: input.projectId,
      clusterId: input.clusterId,
      queryLatencyMs,
      snapshotDecision: "live-clickhouse-read; snapshot once p95 latency exceeds detail-view budget",
    })
    const topMoments = Object.entries(aggregate.momentKindDistribution)
      .sort(([, left], [, right]) => right - left)
      .slice(0, 10)
      .map(([kind, count]) => ({ kind, count }))
    return {
      aggregate,
      representativeExamples,
      topMoments,
      rates: {
        analysisCoverage: aggregate.sourceAnalysisCoverage,
        resolutionRate: rate(countOf(aggregate.momentKindDistribution, "resolution"), conversationDenominator),
        escalationRate: rate(countOf(aggregate.momentKindDistribution, "escalation"), conversationDenominator),
        frustrationRate: rate(countOf(aggregate.momentKindDistribution, "user_frustration"), conversationDenominator),
      },
    } satisfies GetClusterConversationIntelligenceResult
  }).pipe(Effect.withSpan("taxonomy.getClusterConversationIntelligence"))
