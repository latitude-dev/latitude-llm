/**
 * Whether a model's prompt caching is paying for itself, decided per model from
 * its own registry prices rather than against a threshold we invent.
 *
 * Nothing here reads the registry: every input is a number, so the whole state
 * table is exhaustively testable and the module stays safe for the browser entry.
 */

/**
 * Minimum reads a hit rate must be measured over before it may drive a finding.
 * Below this the rate is a one-sample artefact — the same trap the breakdown
 * table's `278x avg` chip fell into, which is what `notEnoughData` absorbs.
 */
export const CACHE_ECONOMICS_MIN_CALLS = 20

/**
 * Shortest prompt the major providers will cache at all — Anthropic and OpenAI
 * both refuse below 1024 tokens. Below it caching is unavailable rather than
 * unprofitable, so recommending it would be wrong however the prices work out.
 */
export const CACHE_MIN_CACHEABLE_INPUT_TOKENS = 1024

/**
 * How far under its ceiling a rate must sit before the shortfall is a finding.
 *
 * Ten points, calibrated against the healthy seed archetype: its three well-run
 * agents sit 4.6, 6.1 and 7.2 points under their ceilings, which is the fresh suffix
 * every real call carries and not something anyone can fix. Comparing against the
 * ceiling strictly flags all three and makes `optimal` unreachable, which is the
 * nagging failure mode the six states exist to prevent.
 *
 * The same band decides whether a caching-off model is worth turning on, because
 * there its measured rate is zero and the gap *is* the ceiling: a cadence that could
 * only ever serve a few percent from cache has nothing to act on either way.
 */
export const CACHE_CEILING_MIN_MATERIAL_GAP = 0.1

/**
 * Three of these render a finding — `cacheIt`, `stopCaching`, `investigate` —
 * and three deliberately render nothing, which is what stops the panel nagging
 * people who are already fine.
 */
export const CACHE_STATES = [
  "optimal",
  "cacheIt",
  "stopCaching",
  "investigate",
  "correctlyOff",
  "notEnoughData",
] as const
export type CacheState = (typeof CACHE_STATES)[number]

/**
 * Severity inside `investigate` / `stopCaching`, same recommendation type either
 * way: `overpaying` means every write is currently costing more than not caching
 * at all, `underusing` means the rate clears break-even but leaves savings behind.
 */
export const CACHE_URGENCIES = ["overpaying", "underusing"] as const
export type CacheUrgency = (typeof CACHE_URGENCIES)[number]

/** Per-1M-token rates, as `getCostSpec` returns them. */
export interface CacheEconomicsPricing {
  readonly input: number
  readonly cacheRead?: number | undefined
  readonly cacheWrite?: number | undefined
}

/**
 * The hit rate at which caching costs exactly what not caching would, from
 * `(input - cacheWrite) / (cacheRead - cacheWrite)`: every miss is priced as a
 * write, which is the steady state a repeated prefix settles into.
 *
 * A missing `cacheWrite` is no write premium (OpenAI-style), so it reads as
 * `input` and the rate collapses to 0% — any read at all is pure upside. Null
 * when the model has no cache-read price, which is not a 0% break-even but an
 * absence of cache economics to reason about.
 *
 * In practice this returns one of two numbers. Every provider that charges for
 * writes copied Anthropic's multipliers — writes at 1.25x input, reads at 0.1x —
 * and the level cancels out of the ratio, leaving 0.25/1.15 = 21.74% for all of
 * them, Haiku and Opus alike. Which is why the ceiling is the interesting term:
 * break-even barely moves, so it is the cadence that decides a verdict.
 */
export function cacheBreakEvenRate({ input, cacheRead, cacheWrite }: CacheEconomicsPricing): number | null {
  if (!(input > 0) || cacheRead === undefined) return null
  const write = cacheWrite ?? input
  const denominator = cacheRead - write
  // Reads and writes priced alike: cost no longer depends on the hit rate at all.
  if (denominator === 0) return write < input ? 0 : null
  const rate = (input - write) / denominator
  if (!Number.isFinite(rate)) return null
  return Math.min(1, Math.max(0, rate))
}

export interface CacheClassificationInput {
  /** Whether the window recorded any cache read or write for this model. */
  readonly cachingOn: boolean
  /** Measured `cacheRead / (input + cacheRead + cacheCreate)`; null when there is no input-side token. */
  readonly actualRate: number | null
  /**
   * Whether caching is measurably costing more than not caching, from this window's own
   * token split and prices. Null when it cannot be priced.
   *
   * Deliberately not derived from `actualRate` against `breakEvenRate`: that comparison
   * assumes every miss is billed as a write, which partial prefix caching does not do, so
   * it reports models as overpaying while they are in fact cheaper than uncached.
   */
  readonly cachingCostsMore: boolean | null
  /** Highest rate this traffic's call cadence could reach. Null until it is computed. */
  readonly ceilingRate: number | null
  readonly breakEvenRate: number | null
  readonly calls: number
  /** Whole prompt per call — uncached input plus cache reads and writes. */
  readonly avgInputTokensPerCall: number
}

export interface CacheClassification {
  readonly state: CacheState
  readonly urgency: CacheUrgency | null
}

const nothing = (state: CacheState): CacheClassification => ({ state, urgency: null })

/**
 * The state table. An unknown `ceilingRate` is treated as "somewhere in 0..1",
 * so a verdict is only returned when every ceiling in that interval agrees:
 * caching-off with a 0% break-even is `cacheIt` whatever the ceiling turns out
 * to be, while a model with a write premium cannot be judged without one.
 *
 * A known ceiling is compared with `CACHE_CEILING_MIN_MATERIAL_GAP` of slack rather
 * than strictly, so the few points of fresh suffix a well-run agent always carries
 * do not read as a finding.
 *
 * Whether caching is *currently* costing money is read from the measured token split via
 * `cachingCostsMore`, not from the rate against break-even. The break-even rate stays the
 * reference the position bar draws and the bar a caching-off model has to look able to
 * clear, both of which are questions about prices rather than about a measured split.
 */
export function classifyCacheState({
  cachingOn,
  actualRate,
  cachingCostsMore,
  ceilingRate,
  breakEvenRate,
  calls,
  avgInputTokensPerCall,
}: CacheClassificationInput): CacheClassification {
  if (calls < CACHE_ECONOMICS_MIN_CALLS || breakEvenRate === null || actualRate === null) {
    return nothing("notEnoughData")
  }

  const materialHeadroom = ceilingRate !== null && ceilingRate - actualRate >= CACHE_CEILING_MIN_MATERIAL_GAP

  if (!cachingOn) {
    if (avgInputTokensPerCall < CACHE_MIN_CACHEABLE_INPUT_TOKENS) return nothing("correctlyOff")
    if (ceilingRate === null) return breakEvenRate <= 0 ? nothing("cacheIt") : nothing("notEnoughData")
    // Clearing break-even is not enough: an isolated-call cadence can reach 0% and
    // still "clear" a 0% break-even, and turning caching on would then buy nothing.
    return ceilingRate >= breakEvenRate && materialHeadroom ? nothing("cacheIt") : nothing("correctlyOff")
  }

  if (cachingCostsMore) {
    // `hopeless` is a counterfactual about a rate not yet reached, so it is the one place
    // the steady-state break-even is the right tool: there is no measured split to read
    // for a hit rate this traffic has never had.
    const hopeless = ceilingRate !== null && ceilingRate < breakEvenRate
    return { state: hopeless ? "stopCaching" : "investigate", urgency: "overpaying" }
  }

  if (materialHeadroom) return { state: "investigate", urgency: "underusing" }
  return nothing("optimal")
}
