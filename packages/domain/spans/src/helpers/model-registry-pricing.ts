import { getCostSpec } from "@domain/models"

/** Per-1M-token USD rates, exactly as the pricing registry states them. */
export interface ModelRegistryPricing {
  readonly input: number
  readonly output: number
  readonly reasoning?: number | undefined
  readonly cacheRead?: number | undefined
  readonly cacheWrite?: number | undefined
}

/**
 * A provider/model pair's registry rates, or null when the registry has no price
 * for it — which is the definition of `unpriced`, not a price of zero. A model
 * priced at zero is a real rate and comes back as one.
 *
 * Tiered pricing collapses to the base tier: long-context tiers scale every rate
 * together, so they barely move a ratio between them, and the dashboard already
 * prices everything else at the base tier.
 */
export function modelRegistryPricing({
  provider,
  model,
}: {
  readonly provider: string
  readonly model: string
}): ModelRegistryPricing | null {
  const { cost, costImplemented } = getCostSpec(provider, model)
  if (!costImplemented) return null
  const tier = Array.isArray(cost) ? cost[0] : cost
  if (!tier) return null
  return {
    input: tier.input,
    output: tier.output,
    reasoning: tier.reasoning,
    cacheRead: tier.cacheRead,
    cacheWrite: tier.cacheWrite,
  }
}
