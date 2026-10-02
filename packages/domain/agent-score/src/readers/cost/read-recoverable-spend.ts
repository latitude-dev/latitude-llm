import type { SessionGenerationFact } from "@domain/spans"
import type { CostMetricReading, CostReadingBase, CostReadingLimitation } from "../../entities/cost-metric-reading.ts"
import { notApplicableReading, unreadableReading } from "../../entities/cost-metric-reading.ts"
import type { SessionSpendCoverage } from "./read-spend-coverage.ts"

const RECOVERABLE_SPEND_BASE = {
  metricId: "cost.recoverable_spend_share",
  family: "spend",
  rawUnit: "microcents",
  aggregation: "resourceRatio",
} as const satisfies CostReadingBase

/**
 * One paid generation another reader proved was avoidable.
 *
 * `exactMicrocents` is spend that disappears with the generation — the whole call, when the call
 * itself should not have happened. `boundedMicrocents` is a component of a call that survives: a
 * token class inside a generation that a total cannot be split by exactly, so it carries an upper
 * bound instead of a point.
 */
export interface AttributableSpendClaim {
  readonly spanId: string
  readonly cause: string
  readonly exactMicrocents?: number
  readonly boundedMicrocents?: { readonly lower: number; readonly upper: number }
}

const claimAtomId = (claim: AttributableSpendClaim): string => `generation:${claim.spanId}`

/**
 * `cost.recoverable_spend_share` — recoverable microcents over priced spend.
 *
 * Claims are unioned by paid generation atom before anything is summed, so two readers blaming the
 * same call cannot recover its cost twice; the union keeps the larger claim. A claim is capped at
 * what its generation actually cost, because a call cannot give back more than it was billed.
 *
 * Provider-reported spend is fine as the observed total while a component saving stays
 * registry-estimated: the denominator is what the session was billed, and the numerator states its
 * own precision. When any claim is bounded rather than exact, the reading reports an identification
 * bound rather than pretending the split was clean.
 */
export const readRecoverableSpend = ({
  generations,
  coverage,
  claims,
}: {
  readonly generations: readonly SessionGenerationFact[]
  readonly coverage: SessionSpendCoverage
  readonly claims: readonly AttributableSpendClaim[]
}): CostMetricReading => {
  if (coverage.spendBearingCallCount === 0) return notApplicableReading(RECOVERABLE_SPEND_BASE)
  if (coverage.pricedCallCount === 0) {
    return unreadableReading(RECOVERABLE_SPEND_BASE, ["missingPricing"])
  }

  const limitations: CostReadingLimitation[] = coverage.complete ? [] : ["missingPricing"]
  const billedBySpan = new Map<string, number>(
    generations.map((generation) => [generation.spanId as string, generation.costTotalMicrocents]),
  )

  const unioned = new Map<string, { readonly claim: AttributableSpendClaim; lower: number; upper: number }>()
  for (const claim of claims) {
    const billed = billedBySpan.get(claim.spanId)
    if (billed === undefined || billed <= 0) continue
    const lower = Math.min(billed, Math.max(0, claim.exactMicrocents ?? claim.boundedMicrocents?.lower ?? 0))
    const upper = Math.min(billed, Math.max(lower, claim.exactMicrocents ?? claim.boundedMicrocents?.upper ?? 0))
    const previous = unioned.get(claimAtomId(claim))
    if (!previous || upper > previous.upper) unioned.set(claimAtomId(claim), { claim, lower, upper })
  }

  const eligibleUnits = coverage.pricedMicrocents
  const lowerMicrocents = [...unioned.values()].reduce((total, entry) => total + entry.lower, 0)
  const upperMicrocents = [...unioned.values()].reduce((total, entry) => total + entry.upper, 0)
  const pointMicrocents = Math.min(eligibleUnits, lowerMicrocents)
  const bounded = upperMicrocents > lowerMicrocents

  return {
    ...RECOVERABLE_SPEND_BASE,
    applicability: "applicable",
    readability: "readable",
    rawValue: eligibleUnits > 0 ? pointMicrocents / eligibleUnits : 0,
    eligibleUnits,
    adverseUnits: pointMicrocents,
    observations: [...unioned.entries()].map(([atomId, entry]) => ({
      atomId,
      eligibleUnits: billedBySpan.get(entry.claim.spanId) ?? 0,
      adverseUnits: entry.lower,
    })),
    evidence: bounded ? "modeled" : "confirmed",
    nativeImpact: {
      unit: "microcents",
      point: pointMicrocents,
      ...(bounded
        ? {
            lower: pointMicrocents,
            upper: Math.min(eligibleUnits, upperMicrocents),
            interpretation: "identificationBound" as const,
          }
        : {}),
    },
    limitations,
  }
}
