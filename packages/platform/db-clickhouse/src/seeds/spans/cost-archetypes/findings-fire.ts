import type { CostCohort } from "./cohorts.ts"
import {
  CLAUDE_HAIKU_4_5,
  CLAUDE_OPUS_4_1,
  CLAUDE_OPUS_4_5,
  COST_LONG_TAIL_MODELS,
  GEMINI_2_5_FLASH_LITE,
  GPT_5_4_MINI,
  GPT_5_6,
  GPT_5_MINI,
  GPT_5_NANO,
  UNPRICED_GATEWAY_MODEL,
} from "./models.ts"

/**
 * Archetype B — the project where findings fire. It runs on the default seed
 * project, which already is the demo project, so the unhealthy archetype needs no
 * project of its own.
 *
 * One model per cache state, because the panel groups by model: two cohorts sharing
 * a model would blend two cache stories into one row. None of these models is one
 * the ambient generator emits, for the same reason.
 *
 * `callsPerCluster: 1` is a cohort whose calls are all isolated, so its achievable
 * ceiling is zero — that is how `Stop caching` gets its data shape. Until LAT-798
 * computes ceilings the classifier only returns verdicts that hold for every
 * possible ceiling, so `b-stop-caching` reads `Investigate` today and `b-underusing`
 * reads `Optimal`. Both are correct; the shapes are here so 2b lights them up
 * without needing new fixtures.
 */

const CACHE_STATE_COHORTS: readonly CostCohort[] = [
  {
    // Healthy row, so the panel is not all findings: a warm prefix reused across a
    // burst of calls, well clear of Anthropic's 21.7% break-even.
    key: "b-optimal",
    serviceName: "research-agent",
    modelConfig: CLAUDE_OPUS_4_5,
    cadence: { endDaysAgo: 0, clusters: 40, clusterSpacingHours: 6, callsPerCluster: 10, gapWithinClusterSeconds: 40 },
    cache: { kind: "prefixReuse", share: 0.93 },
    promptTokens: 12_000,
    completionTokens: 380,
    callsPerSession: 5,
  },
  {
    // Caching on, reads nowhere near the writes that paid for them, and the cadence
    // says they could have been. Actively costing more than not caching at all.
    key: "b-investigate-overpaying",
    serviceName: "classifier",
    modelConfig: CLAUDE_HAIKU_4_5,
    cadence: { endDaysAgo: 0, clusters: 20, clusterSpacingHours: 8, callsPerCluster: 7, gapWithinClusterSeconds: 45 },
    cache: { kind: "flat", profile: { hitRate: 0.06, writeShare: 0.3 } },
    promptTokens: 9_000,
    completionTokens: 120,
    callsPerSession: 7,
  },
  {
    // Caching off on a 26k-token prompt with no write premium to pay: any read at all
    // is pure upside, so this is `Cache it` whatever the ceiling turns out to be.
    key: "b-cache-it",
    serviceName: "doc-extractor",
    modelConfig: GPT_5_MINI,
    cadence: { endDaysAgo: 0, clusters: 48, clusterSpacingHours: 3, callsPerCluster: 1, gapWithinClusterSeconds: 0 },
    cache: { kind: "off" },
    promptTokens: 26_000,
    completionTokens: 300,
    callsPerSession: 4,
  },
  {
    // Every call isolated, so no write is ever read back before it expires, against a
    // model that charges a write premium. `Stop caching` once 2b can say the ceiling
    // sits below break-even.
    key: "b-stop-caching",
    serviceName: "planner",
    modelConfig: GPT_5_6,
    cadence: { endDaysAgo: 0, clusters: 64, clusterSpacingHours: 2.25, callsPerCluster: 1, gapWithinClusterSeconds: 0 },
    cache: { kind: "flat", profile: { hitRate: 0.05, writeShare: 0.28 } },
    promptTokens: 15_000,
    completionTokens: 640,
    callsPerSession: 0,
  },
  {
    // The same 6% rate as the cohort above, on a model with no write premium: it
    // clears break-even, so nothing is being wasted today — but the cadence could
    // support thirteen times it. `Investigate / underusing` once 2b lands, and until
    // then the pair is the clearest demonstration that a rate means nothing without
    // the model's own price list.
    key: "b-underusing",
    serviceName: "router",
    modelConfig: GPT_5_4_MINI,
    cadence: { endDaysAgo: 0, clusters: 22, clusterSpacingHours: 5, callsPerCluster: 5, gapWithinClusterSeconds: 30 },
    cache: { kind: "flat", profile: { hitRate: 0.06, writeShare: 0.02 } },
    promptTokens: 7_000,
    completionTokens: 150,
    callsPerSession: 5,
  },
  {
    // Eight calls against a floor of twenty: a rate here is a one-sample artefact.
    key: "b-not-enough-data",
    serviceName: "tagger",
    modelConfig: GEMINI_2_5_FLASH_LITE,
    cadence: { endDaysAgo: 0, clusters: 8, clusterSpacingHours: 12, callsPerCluster: 1, gapWithinClusterSeconds: 0 },
    cache: { kind: "flat", profile: { hitRate: 0.4, writeShare: 0.1 } },
    promptTokens: 5_000,
    completionTokens: 60,
    callsPerSession: 2,
  },
  {
    // Caching off on a 640-token prompt: below the shortest prompt any major provider
    // will cache, so recommending it would be wrong however the prices work out.
    key: "b-correctly-off",
    serviceName: "guardrail",
    modelConfig: GPT_5_NANO,
    cadence: { endDaysAgo: 0, clusters: 60, clusterSpacingHours: 2, callsPerCluster: 1, gapWithinClusterSeconds: 0 },
    cache: { kind: "off" },
    promptTokens: 640,
    completionTokens: 30,
    callsPerSession: 1,
  },
]

/**
 * The missing-cost cohorts, so coverage reads "at least N%" and the per-row warnings
 * appear. Both zero-cost buckets are needed and they arrive by different routes:
 * `unpriced` is a model the registry has no price for, `unknown` is a row written
 * before `cost_source` existed, whose zero cost cannot say whether the call was free
 * or simply never priced.
 */
const MISSING_COST_COHORTS: readonly CostCohort[] = [
  {
    key: "b-unpriced",
    serviceName: "gateway-proxy",
    modelConfig: UNPRICED_GATEWAY_MODEL,
    cadence: { endDaysAgo: 0, clusters: 30, clusterSpacingHours: 4, callsPerCluster: 1, gapWithinClusterSeconds: 0 },
    cache: { kind: "off" },
    promptTokens: 11_000,
    completionTokens: 400,
    callsPerSession: 0,
    costSource: "unpriced",
  },
  {
    key: "b-unknown",
    serviceName: "legacy-worker",
    modelConfig: CLAUDE_OPUS_4_1,
    cadence: { endDaysAgo: 0, clusters: 26, clusterSpacingHours: 5, callsPerCluster: 1, gapWithinClusterSeconds: 0 },
    cache: { kind: "off" },
    promptTokens: 900,
    completionTokens: 210,
    callsPerSession: 2,
    costSource: "",
  },
]

const LONG_TAIL_COHORTS: readonly CostCohort[] = COST_LONG_TAIL_MODELS.map((modelConfig, index) => ({
  key: `b-long-tail-${index}`,
  serviceName: "experiments",
  modelConfig,
  cadence: {
    endDaysAgo: 0,
    clusters: 1 + (index % 3),
    clusterSpacingHours: 9 + index,
    callsPerCluster: 1,
    gapWithinClusterSeconds: 0,
  },
  cache: { kind: "off" as const },
  promptTokens: 2_000 + index * 700,
  completionTokens: 120 + index * 30,
  // Half the tail is sessionless, so the project carries both shapes.
  callsPerSession: index % 2 === 0 ? 1 : 0,
}))

export const FINDINGS_FIRE_COHORTS: readonly CostCohort[] = [
  ...CACHE_STATE_COHORTS,
  ...MISSING_COST_COHORTS,
  ...LONG_TAIL_COHORTS,
]
