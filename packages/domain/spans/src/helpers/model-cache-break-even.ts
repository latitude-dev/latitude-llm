import { getCostSpec } from "@domain/models"
import { cacheBreakEvenRate } from "./cache-economics.ts"

/**
 * The break-even hit rate for a provider/model pair, read from the pricing
 * registry. Null when the pair is unpriced or has no cache-read rate.
 *
 * Tiered pricing collapses to the base tier: long-context tiers scale every rate
 * together, so they move the break-even hardly at all, and the dashboard already
 * prices everything else at the base tier.
 */
export function modelCacheBreakEvenRate({
  provider,
  model,
}: {
  readonly provider: string
  readonly model: string
}): number | null {
  const { cost, costImplemented } = getCostSpec(provider, model)
  if (!costImplemented) return null
  const tier = Array.isArray(cost) ? cost[0] : cost
  if (!tier) return null
  return cacheBreakEvenRate({ input: tier.input, cacheRead: tier.cacheRead, cacheWrite: tier.cacheWrite })
}
