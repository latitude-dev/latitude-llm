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

// Equal across every router cohort: under `prefixReuse` this alone fixes a model's
// write-to-read ratio, so moving traffic by resizing clusters would move each model's
// own price per token too and the fixture would stop isolating the mix effect.
const ROUTER_CALLS_PER_CLUSTER = 11

// Below ~0.95 a cohort drifts past the material-gap band and fires a cache finding.
const ROUTER_CACHE = { kind: "prefixReuse", share: 0.93 } as const

const ROUTER_PROMPT_TOKENS = 7_000
const ROUTER_COMPLETION_TOKENS = 200

// Counts sum equally per period so every volume factor is flat, and each stays odd so
// the two periods round to the same session total under `callsPerSession: 2`.
const CHEAP_CLUSTERS_BEFORE = 25
const PREMIUM_CLUSTERS_BEFORE = 3
const CHEAP_CLUSTERS_AFTER = 5
const PREMIUM_CLUSTERS_AFTER = 23

// Every spacing this yields must stay above the longest ceiling lifetime, or
// between-cluster gaps turn warm and the cohorts' ceilings change.
const PERIOD_SPAN_HOURS = 27 * 24
const spacingFor = (clusters: number): number => PERIOD_SPAN_HOURS / (clusters - 1)

const routerCohort = ({
  key,
  modelConfig,
  endDaysAgo,
  clusters,
}: {
  key: string
  modelConfig: CostCohort["modelConfig"]
  endDaysAgo: number
  clusters: number
}): CostCohort => ({
  key,
  serviceName: "router",
  modelConfig,
  cadence: {
    endDaysAgo,
    clusters,
    clusterSpacingHours: spacingFor(clusters),
    callsPerCluster: ROUTER_CALLS_PER_CLUSTER,
    gapWithinClusterSeconds: 60,
  },
  cache: ROUTER_CACHE,
  promptTokens: ROUTER_PROMPT_TOKENS,
  completionTokens: ROUTER_COMPLETION_TOKENS,
  callsPerSession: 2,
})

export const REGRESSION_COHORTS: readonly CostCohort[] = [
  routerCohort({
    key: "regression-router-cheap-before",
    modelConfig: GPT_5_MINI,
    endDaysAgo: BEFORE_ENDS_DAYS_AGO,
    clusters: CHEAP_CLUSTERS_BEFORE,
  }),
  routerCohort({
    key: "regression-router-premium-before",
    modelConfig: CLAUDE_OPUS_4_5,
    endDaysAgo: BEFORE_ENDS_DAYS_AGO,
    clusters: PREMIUM_CLUSTERS_BEFORE,
  }),
  routerCohort({
    key: "regression-router-cheap-after",
    modelConfig: GPT_5_MINI,
    endDaysAgo: 0,
    clusters: CHEAP_CLUSTERS_AFTER,
  }),
  routerCohort({
    key: "regression-router-premium-after",
    modelConfig: CLAUDE_OPUS_4_5,
    endDaysAgo: 0,
    clusters: PREMIUM_CLUSTERS_AFTER,
  }),
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
    cache: { kind: "prefixReuse", share: 0.93 },
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
    cache: { kind: "prefixReuse", share: 0.93 },
    promptTokens: 16_000,
    completionTokens: 120,
    callsPerSession: 3,
  },
]
