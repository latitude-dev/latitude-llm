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
 */
export function classifyCacheState({
  cachingOn,
  actualRate,
  ceilingRate,
  breakEvenRate,
  calls,
  avgInputTokensPerCall,
}: CacheClassificationInput): CacheClassification {
  if (calls < CACHE_ECONOMICS_MIN_CALLS || breakEvenRate === null || actualRate === null) {
    return nothing("notEnoughData")
  }

  if (!cachingOn) {
    if (avgInputTokensPerCall < CACHE_MIN_CACHEABLE_INPUT_TOKENS) return nothing("correctlyOff")
    if (ceilingRate === null) return breakEvenRate <= 0 ? nothing("cacheIt") : nothing("notEnoughData")
    return ceilingRate >= breakEvenRate ? nothing("cacheIt") : nothing("correctlyOff")
  }

  if (actualRate < breakEvenRate) {
    const hopeless = ceilingRate !== null && ceilingRate < breakEvenRate
    return { state: hopeless ? "stopCaching" : "investigate", urgency: "overpaying" }
  }

  if (ceilingRate !== null && actualRate < ceilingRate) return { state: "investigate", urgency: "underusing" }
  return nothing("optimal")
}
