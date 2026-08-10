import type { CostCohort } from "./cohorts.ts"
import { CLAUDE_OPUS_4_5, GEMINI_2_5_FLASH, GPT_5_4 } from "./models.ts"

/**
 * Archetype A — boring in a good way, and the most important fixture here.
 *
 * Three models, real spend, 90 days of history, 100% priced, all multi-turn. Every
 * cache row should land on `Optimal`, so the cache panel renders no card at all and
 * coverage reads 100%. If this project shows a recommendation, the thresholds are
 * wrong — that is what it exists to prove.
 *
 * Each cohort caches by warm prefix, so its measured rate is `share x (n-1)/n`
 * against an achievable ceiling of `(n-1)/n`. The remaining few points are the
 * fresh suffix every real call carries, and any workable `underusing` tolerance
 * has to absorb them; a strict "any gap is a finding" rule flags all three, which
 * is the calibration LAT-798 still has to settle.
 *
 * `callsPerSession` divides `callsPerCluster` in every cohort, so no session
 * straddles the day-long gap between two clusters.
 */
export const HEALTHY_COHORTS: readonly CostCohort[] = [
  {
    key: "healthy-support-agent",
    serviceName: "support-agent",
    modelConfig: CLAUDE_OPUS_4_5,
    cadence: { endDaysAgo: 0, clusters: 90, clusterSpacingHours: 24, callsPerCluster: 12, gapWithinClusterSeconds: 45 },
    cache: { kind: "prefixReuse", share: 0.95 },
    promptTokens: 14_000,
    completionTokens: 420,
    callsPerSession: 4,
  },
  {
    // The one cohort whose dollars the provider reported, so `provider_reported`
    // has a home and the confidence strip's verified share is not always zero.
    key: "healthy-triage",
    serviceName: "ticket-triage",
    modelConfig: GPT_5_4,
    cadence: { endDaysAgo: 0, clusters: 88, clusterSpacingHours: 24, callsPerCluster: 10, gapWithinClusterSeconds: 60 },
    cache: { kind: "prefixReuse", share: 0.92 },
    promptTokens: 9_000,
    completionTokens: 260,
    callsPerSession: 5,
    costSource: "provider_reported",
  },
  {
    key: "healthy-summarizer",
    serviceName: "thread-summarizer",
    modelConfig: GEMINI_2_5_FLASH,
    cadence: { endDaysAgo: 0, clusters: 85, clusterSpacingHours: 24, callsPerCluster: 8, gapWithinClusterSeconds: 90 },
    cache: { kind: "prefixReuse", share: 0.93 },
    promptTokens: 6_500,
    completionTokens: 700,
    callsPerSession: 2,
  },
]
