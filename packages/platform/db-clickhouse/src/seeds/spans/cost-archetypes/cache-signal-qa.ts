import type { CostCohort } from "./cohorts.ts"
import {
  CLAUDE_HAIKU_4_5,
  CLAUDE_OPUS_4_5,
  CLAUDE_OPUS_4_7,
  FREE_MODELS,
  GPT_5_4_MINI,
  GPT_5_MINI,
  GPT_5_NANO,
} from "./models.ts"

/**
 * Fixtures for the cache **signal** gates, as distinct from the cache panel's.
 *
 * The LAT-809 archetypes are sized for what the panel shows over a 30-day window; a
 * signal additionally has to hold across three weekly windows, so it needs cohorts with
 * three weeks of history and real weekly volume. Archetype A stays the canonical
 * must-produce-nothing case and is asserted directly rather than restated here — if a
 * well-run project produces a single finding, the gates are wrong.
 *
 * The negatives outnumber the positives on purpose. A missed opportunity costs nothing
 * visible; a false positive dispatches a coding agent at something that may be
 * unfixable, and each of these is a real way that happens.
 */

/** Three weeks plus a margin, so every stability window is fully covered. */
const HISTORY_DAYS = 24

/** Cadence over `HISTORY_DAYS` producing roughly `callsPerWeek` calls in bursts of `burst`. */
const cadenceFor = ({
  callsPerWeek,
  burst,
  gapWithinClusterSeconds,
}: {
  readonly callsPerWeek: number
  readonly burst: number
  readonly gapWithinClusterSeconds: number
}): CostCohort["cadence"] => {
  const clusters = Math.max(1, Math.round((callsPerWeek * (HISTORY_DAYS / 7)) / burst))
  return {
    endDaysAgo: 0,
    clusters,
    clusterSpacingHours: (HISTORY_DAYS * 24) / clusters,
    callsPerCluster: burst,
    gapWithinClusterSeconds,
  }
}

export const CACHE_SIGNAL_POSITIVE_COHORTS: readonly CostCohort[] = [
  {
    // Caching off on a large prompt with no write premium, arriving in bursts that could
    // serve 5/6 of it warm. Any read is pure upside and there are reads to be had.
    key: "signal-cache-it",
    serviceName: "doc-extractor",
    modelConfig: GPT_5_MINI,
    cadence: cadenceFor({ callsPerWeek: 300, burst: 6, gapWithinClusterSeconds: 40 }),
    cache: { kind: "off" },
    promptTokens: 95_000,
    completionTokens: 300,
    callsPerSession: 6,
  },
  {
    // Isolated calls on the one family still holding entries for five minutes: no write is
    // ever read back, so the ceiling is zero and three quarters of the prompt pays a 1.25x
    // write premium for a discount that never arrives.
    key: "signal-stop-caching",
    serviceName: "planner",
    modelConfig: CLAUDE_OPUS_4_7,
    // 100 calls a week is one every 1.7 hours: past every lifetime a provider could
    // plausibly be running, including Anthropic's 1-hour opt-in, so the verdict does not
    // depend on which one it is. Denser traffic would be warm at an hour and the
    // `lifetimeAmbiguous` gate would (correctly) refuse to say anything.
    cadence: cadenceFor({ callsPerWeek: 110, burst: 1, gapWithinClusterSeconds: 0 }),
    cache: { kind: "flat", profile: { hitRate: 0.04, writeShare: 0.75 } },
    promptTokens: 180_000,
    completionTokens: 640,
    callsPerSession: 0,
  },
  {
    // Caching on, reads nowhere near the writes that paid for them, and the cadence says
    // they could have been. Something in prompt construction is breaking the prefix.
    key: "signal-investigate",
    serviceName: "classifier",
    modelConfig: CLAUDE_HAIKU_4_5,
    cadence: cadenceFor({ callsPerWeek: 300, burst: 7, gapWithinClusterSeconds: 45 }),
    cache: { kind: "flat", profile: { hitRate: 0.06, writeShare: 0.3 } },
    promptTokens: 44_000,
    completionTokens: 120,
    callsPerSession: 7,
  },
]

export const CACHE_SIGNAL_NEGATIVE_COHORTS: readonly CostCohort[] = [
  {
    // Sparse traffic with a low hit rate: expensive per call, so the spend floor alone
    // would let it through, and isolated enough that there is nothing to reach. The
    // single most likely false positive.
    key: "signal-sparse-low-rate",
    serviceName: "nightly-report",
    modelConfig: CLAUDE_OPUS_4_5,
    // Above the panel's 20-call floor and below the signal's, so what suppresses it is the
    // gate under test rather than `notEnoughData` catching it first.
    cadence: cadenceFor({ callsPerWeek: 60, burst: 1, gapWithinClusterSeconds: 0 }),
    cache: { kind: "flat", profile: { hitRate: 0.05, writeShare: 0.5 } },
    promptTokens: 120_000,
    completionTokens: 900,
    callsPerSession: 0,
  },
  {
    // Already reusing everything its cadence allows. The remaining gap is the fresh suffix
    // every real call carries, which nobody can close.
    key: "signal-at-ceiling",
    serviceName: "support-agent",
    modelConfig: CLAUDE_OPUS_4_5,
    cadence: cadenceFor({ callsPerWeek: 300, burst: 8, gapWithinClusterSeconds: 45 }),
    cache: { kind: "prefixReuse", share: 1 },
    promptTokens: 30_000,
    completionTokens: 400,
    callsPerSession: 4,
  },
  {
    // Genuinely free, not unpriced. Zero spend cannot be reduced, and a recommendation
    // here would be arithmetic on a division by nothing.
    key: "signal-free",
    serviceName: "bulk-tagger",
    modelConfig: FREE_MODELS[0] ?? GPT_5_NANO,
    cadence: cadenceFor({ callsPerWeek: 400, burst: 6, gapWithinClusterSeconds: 30 }),
    cache: { kind: "off" },
    promptTokens: 40_000,
    completionTokens: 200,
    callsPerSession: 3,
  },
  {
    // Plenty of calls and a genuinely reachable gap, worth a fraction of a cent a week.
    // Above the 1,024-token cacheable floor, so this is the spend floor's case and not
    // `correctlyOff` wearing its clothes.
    key: "signal-below-spend-floor",
    serviceName: "guardrail",
    modelConfig: GPT_5_NANO,
    cadence: cadenceFor({ callsPerWeek: 300, burst: 6, gapWithinClusterSeconds: 30 }),
    cache: { kind: "off" },
    promptTokens: 1_600,
    completionTokens: 40,
    callsPerSession: 1,
  },
  {
    // The `signal-cache-it` shape at a twentieth of the volume: the same quotient over too
    // few calls to conclude the cadence is what it looks like.
    key: "signal-below-sample-floor",
    serviceName: "adhoc-extractor",
    modelConfig: GPT_5_4_MINI,
    cadence: cadenceFor({ callsPerWeek: 45, burst: 5, gapWithinClusterSeconds: 40 }),
    cache: { kind: "off" },
    promptTokens: 95_000,
    completionTokens: 300,
    callsPerSession: 5,
  },
]

/**
 * One model whose verdict alternates week to week, laid out as one cohort per stability
 * window: a healthy middle week between two weeks that each look like a finding on their
 * own. Every rolling three-window view therefore contains a dissenter, which is exactly
 * the series that must not churn the inbox.
 *
 * Built as separate cohorts because a `CostCohort` has one cache profile for its whole
 * span, and the point here is that the profile moves.
 */
const oscillatingWeek = ({
  key,
  endDaysAgo,
  cache,
}: {
  readonly key: string
  readonly endDaysAgo: number
  readonly cache: CostCohort["cache"]
}): CostCohort => ({
  key,
  serviceName: "borderline-summarizer",
  modelConfig: CLAUDE_HAIKU_4_5,
  cadence: { endDaysAgo, clusters: 42, clusterSpacingHours: 3.9, callsPerCluster: 7, gapWithinClusterSeconds: 45 },
  cache,
  promptTokens: 44_000,
  completionTokens: 120,
  callsPerSession: 7,
})

/** A week that looks like a finding: reads far under what this cadence would allow. */
const BORDERLINE_BAD: CostCohort["cache"] = { kind: "flat", profile: { hitRate: 0.06, writeShare: 0.3 } }

/** A week that is fine: the warm prefix is reused on every call that could reuse it. */
const BORDERLINE_GOOD: CostCohort["cache"] = { kind: "prefixReuse", share: 1 }

export const CACHE_SIGNAL_OSCILLATING_COHORTS: readonly CostCohort[] = [
  oscillatingWeek({ key: "signal-oscillating-w0", endDaysAgo: 0, cache: BORDERLINE_BAD }),
  oscillatingWeek({ key: "signal-oscillating-w1", endDaysAgo: 7, cache: BORDERLINE_GOOD }),
  oscillatingWeek({ key: "signal-oscillating-w2", endDaysAgo: 14, cache: BORDERLINE_BAD }),
]
