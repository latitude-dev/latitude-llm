import { promptCacheTtlSeconds } from "@domain/models"
import { cacheHitRate } from "@repo/utils"
import type { CacheEconomics, CacheModelUsage } from "../ports/cost-analytics-repository.ts"
import {
  CACHE_CEILING_LIFETIME_SECONDS,
  CACHE_CEILING_PLAUSIBLE_LIFETIME_SECONDS,
  type CacheCadenceHistogram,
  cacheCeilingRatesByLifetime,
  cacheCeilingSavingsMicrocents,
  cachingPremiumMicrocents,
  clearsCacheSavingsFloor,
} from "./cache-ceiling.ts"
import { type CacheClassification, cacheBreakEvenRate, classifyCacheState } from "./cache-economics.ts"
import { type ModelRegistryPricing, modelRegistryPricing } from "./model-registry-pricing.ts"

export { promptCacheTtlSeconds }

/**
 * One model's whole cache verdict at one assumed cache lifetime: the measured rates,
 * the two references they are judged against, the state, and what acting on it is
 * worth.
 *
 * This is the single place the judgment is computed. The cost dashboard reads it and so
 * will the signal producer that dispatches these findings — computing it twice would
 * let the panel and the signals inbox disagree about the same model, which is worse
 * than either being absent.
 */
export interface CacheModelJudgment extends CacheClassification {
  readonly cachingOn: boolean
  /** Exactly measured from token counts, and independent of any assumed lifetime. */
  readonly actualRate: number | null
  /** Upper bound set by this agent's own cadence at the lifetime this judgment assumes. */
  readonly ceilingRate: number | null
  readonly breakEvenRate: number | null
  /** Modeled from tokens times registry prices, so it will not tie to recorded spend. */
  readonly modeledSavingsMicrocents: number | null
  /** Whether the modeled savings are worth a recommendation card rather than only a table row. */
  readonly savingsClearsFloor: boolean
}

const judgeAtCeiling = ({
  usage,
  pricing,
  ceilingRate,
  breakEvenRate,
  windowMs,
  windowSpendMicrocents,
}: {
  readonly usage: CacheModelUsage
  readonly pricing: ModelRegistryPricing | null
  readonly ceilingRate: number | null
  readonly breakEvenRate: number | null
  readonly windowMs: number
  readonly windowSpendMicrocents: number
}): CacheModelJudgment => {
  const cachingOn = usage.cacheReadTokens + usage.cacheCreateTokens > 0
  const actualRate = cacheHitRate({
    input: usage.inputTokens,
    cacheRead: usage.cacheReadTokens,
    cacheCreate: usage.cacheCreateTokens,
  })

  const classification = classifyCacheState({
    cachingOn,
    actualRate,
    // Measured, not inferred from the rate against break-even: partial prefix caching
    // writes far less than every miss, so the rate comparison reports models as
    // overpaying while they are cheaper than uncached.
    cachingCostsMore: pricing ? cachingPremiumMicrocents(usage, pricing) > 0 : null,
    ceilingRate,
    breakEvenRate,
    calls: usage.calls,
    avgInputTokensPerCall:
      usage.calls > 0 ? (usage.inputTokens + usage.cacheReadTokens + usage.cacheCreateTokens) / usage.calls : 0,
  })

  const modeledSavingsMicrocents = pricing
    ? cacheCeilingSavingsMicrocents({ flow: usage, pricing, ceilingRate, state: classification.state })
    : null

  return {
    ...classification,
    cachingOn,
    actualRate,
    ceilingRate,
    breakEvenRate,
    modeledSavingsMicrocents,
    savingsClearsFloor: clearsCacheSavingsFloor({
      savingsMicrocents: modeledSavingsMicrocents,
      windowMs,
      windowSpendMicrocents,
    }),
  }
}

export interface JudgedCacheModel extends CacheModelUsage {
  /**
   * The verdict at this model's own documented lifetime — the only one that may drive a
   * recommendation card or a signal. A null lifetime means no provider documentation
   * covers the pair, and the judgment then rests on an unknown ceiling.
   */
  readonly documented: CacheModelJudgment
  readonly documentedLifetimeSeconds: number | null
  /**
   * The same verdict recomputed at every offered lifetime, so the panel can answer
   * "what would this look like at an hour?" without a second query and without needing
   * registry prices in the browser.
   *
   * Exploratory only. A lifetime the reader picked is their assumption rather than our
   * assessment, so it must never reach a card or a signal.
   */
  readonly byLifetimeSeconds: Readonly<Record<number, CacheModelJudgment>>
  /**
   * Whether the verdict depends on which lifetime is assumed, across the lifetimes a
   * provider could plausibly be running rather than every offered one. False for most
   * traffic, whose gaps are either seconds or days, and the signal for drawing attention
   * to the lifetime control only where it would change something.
   */
  readonly verdictDependsOnLifetime: boolean
}

/**
 * Every row of a cache-economics read, judged at its documented lifetime and at each
 * offered one.
 *
 * Resolving which lifetime a row documents is part of the judgment rather than the
 * caller's problem: it is a property of the provider and model, and a caller matching
 * the wrong one would silently read someone else's ceiling.
 */
export function judgeCacheEconomics({
  economics,
  windowMs,
}: {
  readonly economics: CacheEconomics
  readonly windowMs: number
}): readonly JudgedCacheModel[] {
  const cadenceByPair = new Map<string, CacheCadenceHistogram>(
    economics.cadence.map((row) => [
      `${row.provider} ${row.model}`,
      { cacheableTokens: row.cacheableTokens, warmTokensByLifetime: row.warmTokensByLifetime },
    ]),
  )

  const windowSpendMicrocents = economics.totals.costMicrocents

  return economics.rows.map((usage): JudgedCacheModel => {
    const pricing = modelRegistryPricing({ provider: usage.provider, model: usage.model })
    const breakEvenRate = pricing ? cacheBreakEvenRate(pricing) : null
    const histogram = cadenceByPair.get(`${usage.provider} ${usage.model}`)
    const ceilingByLifetime: Readonly<Record<number, number | null>> = histogram
      ? cacheCeilingRatesByLifetime(histogram)
      : {}

    const byLifetimeSeconds: Record<number, CacheModelJudgment> = {}
    for (const lifetimeSeconds of CACHE_CEILING_LIFETIME_SECONDS) {
      byLifetimeSeconds[lifetimeSeconds] = judgeAtCeiling({
        usage,
        pricing,
        ceilingRate: ceilingByLifetime[lifetimeSeconds] ?? null,
        breakEvenRate,
        windowMs,
        windowSpendMicrocents,
      })
    }

    const documentedLifetimeSeconds = promptCacheTtlSeconds({ provider: usage.provider, model: usage.model })
    const unknownCeiling = () =>
      judgeAtCeiling({ usage, pricing, ceilingRate: null, breakEvenRate, windowMs, windowSpendMicrocents })
    // An undocumented lifetime is an unknown ceiling, never a borrowed one.
    const documented =
      documentedLifetimeSeconds === null
        ? unknownCeiling()
        : (byLifetimeSeconds[documentedLifetimeSeconds] ?? unknownCeiling())

    return {
      ...usage,
      documented,
      documentedLifetimeSeconds,
      byLifetimeSeconds,
      verdictDependsOnLifetime:
        new Set(CACHE_CEILING_PLAUSIBLE_LIFETIME_SECONDS.map((seconds) => byLifetimeSeconds[seconds]?.state)).size > 1,
    }
  })
}
