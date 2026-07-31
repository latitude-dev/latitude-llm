import type { CostCohort } from "./cohorts.ts"
import { CLAUDE_OPUS_4_5, GPT_5_4, GPT_5_MINI } from "./models.ts"

/**
 * Archetype D — spend rises sharply mid-window, for two causes that must be told
 * apart rather than merely summing to the right total.
 *
 * Two agents, one cause each, so a decomposition that assigns the whole rise to
 * one row is visibly wrong:
 *
 * - `router` shifts traffic toward an expensive model with tokens per call and
 *   turns per session held flat, so the **model mix** row has to carry it.
 * - `context-grader` keeps its model and turn count and grows its retrieved prompt
 *   4x, so the **tokens per step** row has to carry it.
 *
 * Both agents run 28 days before the shift and 28 days after, because
 * period-over-period contribution (LAT-799) cannot be tested at all against a
 * fixture anchored to a single trailing week.
 *
 * Caching is healthy throughout: a cache finding here would be noise competing
 * with the story the project exists to tell.
 */

const BEFORE_ENDS_DAYS_AGO = 28
const PERIOD_CLUSTERS = 28

export const REGRESSION_COHORTS: readonly CostCohort[] = [
  {
    key: "regression-router-cheap-before",
    serviceName: "router",
    modelConfig: GPT_5_MINI,
    cadence: {
      endDaysAgo: BEFORE_ENDS_DAYS_AGO,
      clusters: PERIOD_CLUSTERS,
      clusterSpacingHours: 24,
      callsPerCluster: 20,
      gapWithinClusterSeconds: 60,
    },
    cache: { kind: "prefixReuse", share: 0.9 },
    promptTokens: 7_000,
    completionTokens: 200,
    callsPerSession: 2,
  },
  {
    key: "regression-router-premium-before",
    serviceName: "router",
    modelConfig: CLAUDE_OPUS_4_5,
    cadence: {
      endDaysAgo: BEFORE_ENDS_DAYS_AGO,
      clusters: PERIOD_CLUSTERS,
      clusterSpacingHours: 24,
      callsPerCluster: 2,
      gapWithinClusterSeconds: 60,
    },
    cache: { kind: "prefixReuse", share: 0.9 },
    promptTokens: 7_000,
    completionTokens: 200,
    callsPerSession: 2,
  },
  {
    key: "regression-router-cheap-after",
    serviceName: "router",
    modelConfig: GPT_5_MINI,
    cadence: {
      endDaysAgo: 0,
      clusters: PERIOD_CLUSTERS,
      clusterSpacingHours: 24,
      callsPerCluster: 8,
      gapWithinClusterSeconds: 60,
    },
    cache: { kind: "prefixReuse", share: 0.9 },
    promptTokens: 7_000,
    completionTokens: 200,
    callsPerSession: 2,
  },
  {
    key: "regression-router-premium-after",
    serviceName: "router",
    modelConfig: CLAUDE_OPUS_4_5,
    cadence: {
      endDaysAgo: 0,
      clusters: PERIOD_CLUSTERS,
      clusterSpacingHours: 24,
      callsPerCluster: 14,
      gapWithinClusterSeconds: 60,
    },
    cache: { kind: "prefixReuse", share: 0.9 },
    promptTokens: 7_000,
    completionTokens: 200,
    callsPerSession: 2,
  },
  {
    key: "regression-grader-before",
    serviceName: "context-grader",
    modelConfig: GPT_5_4,
    cadence: {
      endDaysAgo: BEFORE_ENDS_DAYS_AGO,
      clusters: PERIOD_CLUSTERS,
      clusterSpacingHours: 24,
      callsPerCluster: 12,
      gapWithinClusterSeconds: 120,
    },
    cache: { kind: "prefixReuse", share: 0.88 },
    promptTokens: 4_000,
    completionTokens: 120,
    callsPerSession: 3,
  },
  {
    key: "regression-grader-after",
    serviceName: "context-grader",
    modelConfig: GPT_5_4,
    cadence: {
      endDaysAgo: 0,
      clusters: PERIOD_CLUSTERS,
      clusterSpacingHours: 24,
      callsPerCluster: 12,
      gapWithinClusterSeconds: 120,
    },
    cache: { kind: "prefixReuse", share: 0.88 },
    promptTokens: 16_000,
    completionTokens: 120,
    callsPerSession: 3,
  },
]
