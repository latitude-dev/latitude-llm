import type { GenerationPricingState, SessionGenerationFact } from "@domain/spans"

/**
 * What the session's spend side can be trusted to say, per pricing state.
 *
 * Provider-reported and registry-estimated spend stay separate because they are different claims
 * about provenance — but both are priced, and the Spend family is fully usable when every value
 * came from the registry. That is the expected case, not a degraded one.
 */
export interface SessionSpendCoverage {
  readonly pricedMicrocents: number
  readonly providerReportedMicrocents: number
  readonly registryEstimatedMicrocents: number
  readonly pricedCallCount: number
  readonly knownFreeCallCount: number
  /** Tokens with no usable rate, including a catalog that declines to price the pair. */
  readonly unpricedCallCount: number
  readonly unknownPairCallCount: number
  readonly legacyUnknownCallCount: number
  readonly spendBearingCallCount: number
  /** True when every spend-bearing call is either priced or a known zero. */
  readonly complete: boolean
}

/** States that leave real spend unaccounted for. A known zero is not one of them. */
const GAP_STATES: ReadonlySet<GenerationPricingState> = new Set(["unpriced", "unknownPair", "legacyUnknown"])

const isSpendBearing = (state: GenerationPricingState): boolean => state !== "notSpendBearing"

export const readSessionSpendCoverage = (generations: readonly SessionGenerationFact[]): SessionSpendCoverage => {
  const spendBearing = generations.filter((generation) => isSpendBearing(generation.pricingState))
  const microcentsOf = (state: GenerationPricingState): number =>
    spendBearing
      .filter((generation) => generation.pricingState === state)
      .reduce((total, generation) => total + generation.costTotalMicrocents, 0)
  const countOf = (state: GenerationPricingState): number =>
    spendBearing.filter((generation) => generation.pricingState === state).length

  const providerReportedMicrocents = microcentsOf("providerReported")
  const registryEstimatedMicrocents = microcentsOf("registryEstimated")
  const gapCallCount = spendBearing.filter((generation) => GAP_STATES.has(generation.pricingState)).length

  return {
    pricedMicrocents: providerReportedMicrocents + registryEstimatedMicrocents,
    providerReportedMicrocents,
    registryEstimatedMicrocents,
    pricedCallCount: countOf("providerReported") + countOf("registryEstimated"),
    knownFreeCallCount: countOf("knownFree"),
    unpricedCallCount: countOf("unpriced"),
    unknownPairCallCount: countOf("unknownPair"),
    legacyUnknownCallCount: countOf("legacyUnknown"),
    spendBearingCallCount: spendBearing.length,
    complete: gapCallCount === 0,
  }
}
