import { Effect } from "effect"
import type {
  ClusterAnalysisAggregate,
  TaxonomyClusterIntelligenceRepositoryShape,
} from "../ports/taxonomy-cluster-intelligence-repository.ts"

const EMPTY_AGGREGATE: ClusterAnalysisAggregate = {
  sourceObservationCount: 0,
  sourceSessionCount: 0,
  sourceAnalysisCount: 0,
  sourceAnalysisCoverage: 0,
  momentKindDistribution: {},
  eligibleSessionCount: 0,
  skippedCount: 0,
  failedCount: 0,
}

/**
 * In-memory intelligence repo for use-case tests. Every method returns an empty
 * result by default; pass `overrides` to return fixtures or capture the inputs a
 * use-case forwards (e.g. the resolved subtree ids or the custom-behavior scope).
 */
export const createFakeTaxonomyClusterIntelligenceRepository = (
  overrides?: Partial<TaxonomyClusterIntelligenceRepositoryShape>,
) => {
  const repository: TaxonomyClusterIntelligenceRepositoryShape = {
    getClusterAggregate: () => Effect.succeed(EMPTY_AGGREGATE),
    listRepresentativeExamples: () => Effect.succeed([]),
    listSessionTraceIds: () => Effect.succeed([]),
    listClusterSessions: () => Effect.succeed({ sessions: [], histogram: [], hasMore: false, nextOffset: null }),
    getClusterTrajectory: () => Effect.succeed([]),
    ...overrides,
  }
  return { repository }
}
