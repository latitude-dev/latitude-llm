import { cacheBreakEvenRate } from "./cache-economics.ts"
import { modelRegistryPricing } from "./model-registry-pricing.ts"

/**
 * The break-even hit rate for a provider/model pair, read from the pricing
 * registry. Null when the pair is unpriced or has no cache-read rate.
 */
export function modelCacheBreakEvenRate({
  provider,
  model,
}: {
  readonly provider: string
  readonly model: string
}): number | null {
  const pricing = modelRegistryPricing({ provider, model })
  if (!pricing) return null
  return cacheBreakEvenRate(pricing)
}
