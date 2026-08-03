/**
 * The achievable ceiling and what closing the gap to it would be worth.
 *
 * Two deliberately different kinds of number meet here. Cache *rates* — actual and
 * ceiling both — are exact: every input is a token count. Cache *dollars* are
 * modeled from token counts times registry prices and will not tie to the recorded
 * spend the breakdown table shows, because provider-reported cost folds the cache
 * portion into the input side and cannot be recovered by subtraction. Anything this
 * module returns in microcents has to be presented as modeled.
 *
 * Nothing here reads the registry, so the whole thing stays browser-safe and every
 * number below is reachable from a unit test.
 */

import type { CacheEconomicsPricing, CacheState } from "./cache-economics.ts"

const MICROCENTS_PER_USD = 100_000_000
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Savings below this are noise in absolute terms: "save $0.12/week" is not worth a
 * card, and a rate gap on traffic this cheap is not worth anyone reading their
 * prompt-construction code over. Expressed weekly because the window is the reader's
 * choice — a floor in absolute dollars would suppress everything on a one-day window
 * and nothing on a ninety-day one.
 */
export const CACHE_SAVINGS_MIN_WEEKLY_MICROCENTS = MICROCENTS_PER_USD

/**
 * Savings below this share of the window's spend are noise in relative terms. A dollar
 * figure that is real money to one project is a rounding error to the next, so an
 * absolute floor alone would fill a large customer's panel with cards worth a thousandth
 * of their bill while a small one sees nothing.
 *
 * A pure window-over-window ratio, so unlike the weekly floor it needs no time
 * normalisation: both sides are measured over the same window.
 */
export const CACHE_SAVINGS_MIN_SPEND_SHARE = 0.01

/** Measured token flow for one model, the exact half of the calculation. */
export interface CacheTokenFlow {
  readonly inputTokens: number
  readonly cacheReadTokens: number
  readonly cacheCreateTokens: number
}

/**
 * Every cache lifetime the ceiling is measured against, ascending.
 *
 * The documented values live here alongside ones no provider currently publishes,
 * because the panel lets a reader ask "what would my ceiling be at an hour?" — and a
 * lifetime that is only ever explored still has to be a bucket boundary for the answer
 * to be exact. This is the single source the query's buckets are generated from, so a
 * lifetime cannot be offered without being measurable.
 */
export const CACHE_CEILING_LIFETIME_SECONDS: readonly number[] = [60, 300, 1_800, 3_600, 86_400]

/**
 * The subset a real provider could plausibly be running: the two documented defaults
 * plus Anthropic's documented 1-hour opt-in, which is real but undetectable from spans.
 *
 * Used for "does the verdict depend on the assumed lifetime?" rather than the full
 * offered set. At 24 hours almost any traffic called more than daily becomes fully warm,
 * so measuring sensitivity across every offered lifetime would flag nearly every row and
 * the flag would be noise instead of a signal. 60 seconds is the same problem inverted.
 */
export const CACHE_CEILING_PLAUSIBLE_LIFETIME_SECONDS: readonly number[] = [300, 1_800, 3_600]

/**
 * Cadence measured against one lifetime: how much cache-eligible volume arrived close
 * enough behind another call to have found a warm entry.
 */
export interface CacheCadence {
  readonly cacheableTokens: number
  readonly warmTokens: number
}

/**
 * Volume by lifetime for one model, as the query returns it: `warmTokensByLifetime` is
 * **cumulative**, so the entry for 300 already contains everything warm at 60. That is
 * what lets a reader move between lifetimes with no second query and no arithmetic
 * beyond a lookup.
 */
export interface CacheCadenceHistogram {
  readonly cacheableTokens: number
  readonly warmTokensByLifetime: Readonly<Record<number, number>>
}

/**
 * The ceiling at every offered lifetime, from one histogram. Keyed by seconds so a
 * caller resolving a different lifetime per provider does a lookup rather than a scan.
 */
export function cacheCeilingRatesByLifetime(histogram: CacheCadenceHistogram): Readonly<Record<number, number | null>> {
  const rates: Record<number, number | null> = {}
  for (const lifetimeSeconds of CACHE_CEILING_LIFETIME_SECONDS) {
    rates[lifetimeSeconds] = cacheCeilingRate({
      cacheableTokens: histogram.cacheableTokens,
      warmTokens: histogram.warmTokensByLifetime[lifetimeSeconds] ?? 0,
    })
  }
  return rates
}

/**
 * The highest cache hit rate this traffic's arrival pattern could ever produce.
 *
 * Null when there is no volume to divide by. This is an upper bound on an upper
 * bound: it assumes every call to an agent shares the same cacheable prefix, which
 * cannot be verified without comparing message content, so a real workload can only
 * come in under it.
 */
export function cacheCeilingRate({ cacheableTokens, warmTokens }: CacheCadence): number | null {
  if (!(cacheableTokens > 0)) return null
  return Math.min(1, Math.max(0, warmTokens / cacheableTokens))
}

const perMillion = (tokens: number, ratePerMillion: number): number =>
  (tokens / 1_000_000) * ratePerMillion * MICROCENTS_PER_USD

/** A miss on a repeated prefix is billed as a write, which is the steady state break-even is derived from. */
const missRate = (pricing: CacheEconomicsPricing): number => pricing.cacheWrite ?? pricing.input

/**
 * What the window's input side cost, modeled from the measured token split rather
 * than from the recorded dollars, so it is comparable with the counterfactuals below.
 */
export function modeledInputCostMicrocents(flow: CacheTokenFlow, pricing: CacheEconomicsPricing): number {
  return (
    perMillion(flow.inputTokens, pricing.input) +
    perMillion(flow.cacheReadTokens, pricing.cacheRead ?? pricing.input) +
    perMillion(flow.cacheCreateTokens, missRate(pricing))
  )
}

const cacheableTokens = (flow: CacheTokenFlow): number =>
  flow.inputTokens + flow.cacheReadTokens + flow.cacheCreateTokens

/**
 * What caching is costing over not caching at all, from the measured token split.
 * Positive means the writes are not being paid for by the reads.
 *
 * This is the exact answer to "is caching paying?", and it is not the same question as
 * the break-even *rate*. Break-even is a property of the price list under a steady-state
 * assumption — that every miss is billed as a write — which does not describe partial
 * prefix caching, where the stable prefix is cached and the variable suffix stays plain
 * uncached input. Whenever less than `1 - hitRate` of the volume is actually written,
 * break-even overstates the rate a model needs, and a model can sit below it while
 * caching is genuinely cheaper.
 */
export function cachingPremiumMicrocents(flow: CacheTokenFlow, pricing: CacheEconomicsPricing): number {
  const volume = cacheableTokens(flow)
  if (!(volume > 0)) return 0
  return modeledInputCostMicrocents(flow, pricing) - perMillion(volume, pricing.input)
}

export interface CacheSavingsInput {
  readonly flow: CacheTokenFlow
  readonly pricing: CacheEconomicsPricing
  readonly ceilingRate: number | null
  /** The verdict decides which counterfactual is the right one to price. */
  readonly state: CacheState
}

/**
 * What acting on the finding would be worth over this window, or null when there is
 * no finding to act on and nothing to compare against.
 *
 * The counterfactual is the recommendation, not one formula for every row: telling
 * someone to stop caching and then pricing the ceiling they were told to abandon
 * would report the cost of following the *other* advice. So `stopCaching` is priced
 * against caching switched off entirely, and the two states that ask for more
 * caching are priced against reaching the ceiling.
 *
 * Null rather than zero for a non-finding, and null for a negative delta: a state
 * where acting costs money is not a saving, and the savings-descending sort should
 * let it sink rather than show a minus sign nobody asked about.
 */
export function cacheCeilingSavingsMicrocents({ flow, pricing, ceilingRate, state }: CacheSavingsInput): number | null {
  if (state !== "stopCaching" && state !== "cacheIt" && state !== "investigate") return null
  if (!(pricing.input > 0)) return null
  const volume = cacheableTokens(flow)
  if (!(volume > 0)) return null
  if (state !== "stopCaching" && ceilingRate === null) return null

  const target =
    state === "stopCaching"
      ? perMillion(volume, pricing.input)
      : perMillion(volume * (ceilingRate ?? 0), pricing.cacheRead ?? pricing.input) +
        perMillion(volume * (1 - (ceilingRate ?? 0)), missRate(pricing))

  const savings = modeledInputCostMicrocents(flow, pricing) - target
  return savings > 0 ? savings : null
}

/**
 * The window's savings restated as a weekly rate, which is the only scale the floor
 * can be defended at. Zero-length windows cannot be annualised, so they read as no
 * savings rather than as infinite ones.
 */
export function weeklyCacheSavingsMicrocents({
  savingsMicrocents,
  windowMs,
}: {
  readonly savingsMicrocents: number
  readonly windowMs: number
}): number {
  if (!(windowMs > 0)) return 0
  return savingsMicrocents * (WEEK_MS / windowMs)
}

/**
 * Whether a finding is worth surfacing as a card rather than left in the table.
 *
 * Both floors have to clear, because they suppress different kinds of noise and each is
 * useless alone: the absolute one would let a thousandth of a large bill through, and
 * the relative one would promote half the spend of a model costing four cents. Taking
 * them as alternatives rather than as a conjunction defeats the point — any finding that
 * clears the absolute floor also clears an `or`, so the relative bar would never bind.
 */
export function clearsCacheSavingsFloor({
  savingsMicrocents,
  windowMs,
  windowSpendMicrocents,
}: {
  readonly savingsMicrocents: number | null
  readonly windowMs: number
  /** Billable spend across the whole window, which is what makes the bar scale. */
  readonly windowSpendMicrocents: number
}): boolean {
  if (savingsMicrocents === null || savingsMicrocents <= 0) return false
  const clearsAbsolute =
    weeklyCacheSavingsMicrocents({ savingsMicrocents, windowMs }) >= CACHE_SAVINGS_MIN_WEEKLY_MICROCENTS
  // No spend to be a share of leaves only the absolute bar, rather than dividing by zero
  // and promoting everything.
  const clearsRelative =
    !(windowSpendMicrocents > 0) || savingsMicrocents / windowSpendMicrocents >= CACHE_SAVINGS_MIN_SPEND_SHARE
  return clearsAbsolute && clearsRelative
}
