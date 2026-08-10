import type { CostCohort } from "./cohorts.ts"
import {
  CLAUDE_HAIKU_4_5,
  CLAUDE_OPUS_4_1,
  CLAUDE_OPUS_4_5,
  CLAUDE_OPUS_4_6,
  CLAUDE_OPUS_4_7,
  COST_LONG_TAIL_MODELS,
  GEMINI_2_5_FLASH_LITE,
  GPT_5_4_MINI,
  GPT_5_6_LUNA,
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
 * ceiling is zero — that is how `Stop caching` gets its data shape. Which provider a
 * cohort runs on therefore matters as much as its cadence: the same hourly calls are
 * cold on Anthropic's five minutes and warm under OpenAI's day of extended retention.
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
    // Caching on, reads nowhere near the writes that paid for them, and the cadence says
    // they could have been. Actively costing more than not caching at all, and sized so
    // the finding is worth a card rather than a shrug.
    key: "b-investigate-overpaying",
    serviceName: "classifier",
    modelConfig: CLAUDE_HAIKU_4_5,
    cadence: { endDaysAgo: 0, clusters: 30, clusterSpacingHours: 6, callsPerCluster: 7, gapWithinClusterSeconds: 45 },
    cache: { kind: "flat", profile: { hitRate: 0.06, writeShare: 0.3 } },
    promptTokens: 44_000,
    completionTokens: 120,
    callsPerSession: 7,
  },
  {
    // Caching off on a large prompt with no write premium to pay, arriving in bursts
    // that could serve 5/6 of it from cache: any read is pure upside and there are reads
    // to be had, which is what separates `Cache it` from a cadence that cannot use a
    // cache at all. Sized so the modeled saving clears the weekly floor and the card
    // actually renders — a state with no card demonstrates only half the panel.
    key: "b-cache-it",
    serviceName: "doc-extractor",
    modelConfig: GPT_5_MINI,
    cadence: { endDaysAgo: 0, clusters: 56, clusterSpacingHours: 4, callsPerCluster: 6, gapWithinClusterSeconds: 40 },
    cache: { kind: "off" },
    promptTokens: 95_000,
    completionTokens: 300,
    callsPerSession: 6,
  },
  {
    key: "b-stop-caching",
    serviceName: "planner",
    modelConfig: CLAUDE_OPUS_4_7,
    // Isolated calls 72 minutes apart, on the one provider still holding entries for five
    // minutes: no write is ever read back, so the ceiling is 0. Nearly half the prompt is
    // written to cache at a 1.25x premium for nothing, which is what makes stopping worth
    // real money rather than rounding error. On an OpenAI model this same cadence is warm
    // — extended retention keeps its listed families for a day.
    cadence: { endDaysAgo: 0, clusters: 150, clusterSpacingHours: 1.2, callsPerCluster: 1, gapWithinClusterSeconds: 0 },
    cache: { kind: "flat", profile: { hitRate: 0.04, writeShare: 0.75 } },
    promptTokens: 64_000,
    completionTokens: 640,
    callsPerSession: 0,
  },
  {
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
    // Ten minutes between calls — the one cadence where the assumed lifetime decides the
    // verdict rather than merely shading a number. OpenAI holds this family for a day, so
    // these gaps are warm and the shortfall is something in the prompt (`Investigate`).
    // Drop the control to five minutes, which is what a Zero Data Retention org actually
    // gets, and every gap is a miss: the ceiling collapses and the same rows say
    // `Stop caching` — advice to abandon a cache that was working.
    key: "b-ttl-sensitive",
    serviceName: "briefing-writer",
    modelConfig: GPT_5_6_LUNA,
    cadence: { endDaysAgo: 0, clusters: 20, clusterSpacingHours: 12, callsPerCluster: 6, gapWithinClusterSeconds: 600 },
    // Write share above 3.6x the hit rate, which is where this model's prices make caching
    // actually cost more than not caching. Below it the cache is cheaper despite sitting
    // under break-even, and the cohort would demonstrate nothing.
    cache: { kind: "flat", profile: { hitRate: 0.08, writeShare: 0.4 } },
    promptTokens: 30_000,
    completionTokens: 300,
    callsPerSession: 6,
  },
  {
    // Forty minutes between calls, on a model whose documented lifetime is five: the
    // shape of a customer who opted into Anthropic's 1-hour cache, which nothing an
    // exporter sends tells us about. Documented reading says the cadence cannot cache;
    // at an hour it can. The only cohort where the 1-hour option is the mover, and the
    // reason the lifetime control exists at all.
    key: "b-opted-into-hour",
    serviceName: "digest-builder",
    modelConfig: CLAUDE_OPUS_4_6,
    cadence: {
      endDaysAgo: 0,
      clusters: 16,
      clusterSpacingHours: 24,
      callsPerCluster: 5,
      gapWithinClusterSeconds: 2_400,
    },
    cache: { kind: "flat", profile: { hitRate: 0.1, writeShare: 0.3 } },
    promptTokens: 30_000,
    completionTokens: 260,
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
 * `unpriced` is a model the registry has no price for — the span builder derives that
 * from the failed lookup, so this cohort states no `costSource` at all — while
 * `unknown` is a row written before `cost_source` existed, whose zero cost cannot say
 * whether the call was free or simply never priced.
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
