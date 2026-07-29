import { getCostSpec, type ModelCostTier } from "@domain/models"
import type { CostUnpricedPair } from "../ports/cost-analytics-repository.ts"

/**
 * Why a provider/model pair recorded usage but no cost.
 *
 * - `missingPricing` — the registry has no price for the pair, so cost stayed 0
 *   silently. A real gap: the window's spend is understated.
 * - `ingestGap` — the registry prices the pair today, yet stored cost is 0. Past
 *   ingest ran without pricing (or with a different model string); repairable.
 * - `freePricing` — the registry prices the pair at zero. `:free` variants and
 *   self-hosted models genuinely cost nothing, so this is not a gap.
 */
export const UNPRICED_CAUSES = ["missingPricing", "ingestGap", "freePricing"] as const
export type UnpricedCause = (typeof UNPRICED_CAUSES)[number]

export interface ClassifiedUnpricedPair extends CostUnpricedPair {
  readonly cause: UnpricedCause
}

/**
 * Zero-cost usage split into what is actually missing money and what is
 * correctly free. Only `gapTokens` / `gapCalls` belong in a headline figure —
 * counting free models there would make the disclosure cry wolf permanently.
 */
export interface UnpricedUsageSummary {
  readonly pairs: readonly ClassifiedUnpricedPair[]
  readonly gapTokens: number
  readonly gapCalls: number
  readonly gapPairCount: number
  readonly freeTokens: number
  readonly freeCalls: number
  /**
   * Share of billable tokens we could put a price on, free models included. The
   * one precision figure that actually moves: the provider-reported share is a
   * statement of method, whereas this drops the moment pricing breaks for a
   * model in use. Null when the window has no billable tokens.
   */
  readonly pricedCoverage: number | null
}

const hasNonZeroRate = (tier: ModelCostTier): boolean =>
  [tier.input, tier.output, tier.reasoning, tier.cacheRead, tier.cacheWrite].some((rate) => (rate ?? 0) > 0)

export function classifyUnpricedPair(pair: CostUnpricedPair): ClassifiedUnpricedPair {
  const { cost, costImplemented } = getCostSpec(pair.provider, pair.model)
  if (!costImplemented) return { ...pair, cause: "missingPricing" }
  const priced = Array.isArray(cost) ? cost.some(hasNonZeroRate) : hasNonZeroRate(cost)
  return { ...pair, cause: priced ? "ingestGap" : "freePricing" }
}

export const isUnpricedGap = (pair: ClassifiedUnpricedPair): boolean => pair.cause !== "freePricing"

export function summarizeUnpricedUsage({
  candidatePairs,
  billableTokens,
}: {
  readonly candidatePairs: readonly CostUnpricedPair[]
  readonly billableTokens: number
}): UnpricedUsageSummary {
  const pairs = candidatePairs.map(classifyUnpricedPair)
  const gaps = pairs.filter(isUnpricedGap)
  const free = pairs.filter((pair) => !isUnpricedGap(pair))
  const gapTokens = gaps.reduce((sum, pair) => sum + pair.tokens, 0)
  return {
    pairs,
    gapTokens,
    gapCalls: gaps.reduce((sum, pair) => sum + pair.calls, 0),
    gapPairCount: gaps.length,
    freeTokens: free.reduce((sum, pair) => sum + pair.tokens, 0),
    freeCalls: free.reduce((sum, pair) => sum + pair.calls, 0),
    pricedCoverage: billableTokens > 0 ? Math.max(0, 1 - gapTokens / billableTokens) : null,
  }
}
