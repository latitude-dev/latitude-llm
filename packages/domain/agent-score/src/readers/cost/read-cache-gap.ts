import {
  CACHE_CEILING_MIN_MATERIAL_GAP,
  CACHE_ECONOMICS_MIN_CALLS,
  CACHE_MIN_CACHEABLE_INPUT_TOKENS,
  type SessionGenerationFact,
} from "@domain/spans"
import type { CostMetricReading, CostReadingBase } from "../../entities/cost-metric-reading.ts"
import { notApplicableReading, unreadableReading } from "../../entities/cost-metric-reading.ts"

const CACHE_GAP_BASE = {
  metricId: "cost.cache_gap",
  family: "context",
  rawUnit: "cacheTokens",
  aggregation: "resourceRatio",
} as const satisfies CostReadingBase

/**
 * The existing cache guards, restated as this reader's applicability rather than as its curve.
 *
 * The Cost page uses these three to decide whether to *say* anything about caching. Reusing them as
 * applicability keeps one definition of "there is enough cache traffic to reason about", while
 * leaving how much a gap costs entirely to the scoring artifact — a guard that quietly became a
 * threshold would be a calibration constant hiding in a reader.
 */
export const CACHE_GAP_GUARDS = {
  minimumCalls: CACHE_ECONOMICS_MIN_CALLS,
  minimumAverageInputTokens: CACHE_MIN_CACHEABLE_INPUT_TOKENS,
  minimumMaterialGap: CACHE_CEILING_MIN_MATERIAL_GAP,
} as const

/**
 * How confidently the achievable cache volume is known.
 *
 * `prefixMatched` — readable prompts confirmed the calls share a cacheable prefix, so the
 * achievable volume is measured. `cadenceOnly` — only arrival timing is known, which assumes every
 * call shares a prefix and therefore yields an upper bound on an upper bound.
 */
const CACHE_ACHIEVABLE_BASES = ["prefixMatched", "cadenceOnly"] as const
export type CacheAchievableBasis = (typeof CACHE_ACHIEVABLE_BASES)[number]

export interface SessionCacheEvidence {
  readonly cacheEligibleCallCount: number
  readonly averageInputTokens: number
  /** Cache-eligible input tokens the arrival pattern could have served warm. */
  readonly achievableCacheTokens: number
  readonly observedCacheReadTokens: number
  readonly basis: CacheAchievableBasis
  /** Absent when the model has no cache-read price, which is not a zero gap but no economics. */
  readonly cacheReadPriced: boolean
}

/**
 * `cost.cache_gap` — missed achievable cache tokens over achievable cache tokens.
 *
 * A cadence-only basis cannot prove the calls shared a prefix, so its miss is reported as an upper
 * identification bound with a zero floor: the shortfall is at most this, and possibly none of it.
 * A prefix-matched basis is exact. Below the material gap the calls are working as well as a fresh
 * suffix allows, which is applicability rather than a healthy score.
 */
export const readCacheGap = ({
  generations,
  evidence,
}: {
  readonly generations: readonly SessionGenerationFact[]
  readonly evidence: SessionCacheEvidence | null
}): CostMetricReading => {
  if (generations.length === 0 || evidence === null) return notApplicableReading(CACHE_GAP_BASE)
  if (!evidence.cacheReadPriced) return notApplicableReading(CACHE_GAP_BASE)
  if (
    evidence.cacheEligibleCallCount < CACHE_GAP_GUARDS.minimumCalls ||
    evidence.averageInputTokens < CACHE_GAP_GUARDS.minimumAverageInputTokens
  ) {
    return notApplicableReading(CACHE_GAP_BASE)
  }
  if (evidence.achievableCacheTokens <= 0) {
    return unreadableReading(CACHE_GAP_BASE, ["missingContent"])
  }

  const missedTokens = Math.max(0, evidence.achievableCacheTokens - evidence.observedCacheReadTokens)
  const rawValue = missedTokens / evidence.achievableCacheTokens
  if (rawValue < CACHE_GAP_GUARDS.minimumMaterialGap) return notApplicableReading(CACHE_GAP_BASE)

  const cadenceOnly = evidence.basis === "cadenceOnly"
  return {
    ...CACHE_GAP_BASE,
    applicability: "applicable",
    readability: "readable",
    rawValue,
    eligibleUnits: evidence.achievableCacheTokens,
    adverseUnits: missedTokens,
    observations: [
      { atomId: "cache:session", eligibleUnits: evidence.achievableCacheTokens, adverseUnits: missedTokens },
    ],
    evidence: cadenceOnly ? "modeled" : "confirmed",
    nativeImpact: {
      unit: "cacheTokens",
      point: missedTokens,
      ...(cadenceOnly ? { lower: 0, upper: missedTokens, interpretation: "identificationBound" as const } : {}),
    },
    limitations: cadenceOnly ? ["missingContent"] : [],
  }
}
