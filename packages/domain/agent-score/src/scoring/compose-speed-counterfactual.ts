import { marginalCriticalPathNs, type SessionCriticalPath, type TraceCriticalPath } from "@domain/spans"
import type { EstimateRange } from "../entities/cost-evidence.ts"
import type { CostEvidenceStrength } from "../entities/cost-metric-reading.ts"

/**
 * One observation's claim that some critical-path time did not need to happen.
 *
 * `removedNs` is what the observation asserts would disappear — a whole redundant call, or the
 * excess over a frozen cohort expectation. It is a claim, not a result: the counterfactual caps it
 * by what the span's subtree actually held on the path.
 */
export interface SpeedAvoidableClaim {
  readonly traceId: string
  readonly spanId: string
  readonly cause: string
  readonly removedNs: number
  readonly evidence: CostEvidenceStrength
  /** Same-unit bounds when the claim is modeled. Absent on an exact segment. */
  readonly bounds?: { readonly lowerNs: number; readonly upperNs: number }
}

export interface SpeedCounterfactual {
  readonly observedNs: number
  readonly avoidableNs: number
  readonly measuredAvoidableNs: number
  readonly estimatedAvoidableNs: number
  readonly nativeImpact: EstimateRange
  readonly appliedClaims: readonly SpeedAvoidableClaim[]
  readonly droppedClaims: readonly { readonly claim: SpeedAvoidableClaim; readonly reason: SpeedClaimDropReason }[]
  /** False when no trace reconstructed, so the session must not enter the Speed denominator. */
  readonly usableForDenominator: boolean
}

export const SPEED_CLAIM_DROP_REASONS = ["noPath", "coveredByAncestor", "supersededByExact", "offCriticalPath"] as const
export type SpeedClaimDropReason = (typeof SPEED_CLAIM_DROP_REASONS)[number]

const strengthRank: Readonly<Record<CostEvidenceStrength, number>> = { confirmed: 0, modeled: 1 }

const claimKey = (claim: SpeedAvoidableClaim): string => `${claim.traceId} ${claim.spanId}`

/**
 * Keeps one claim per span, exact evidence first.
 *
 * A modeled signal effect on a span an exact reader already measured is the same time counted
 * twice with less confidence, so the exact segment wins outright.
 */
const dedupeBySpan = (
  claims: readonly SpeedAvoidableClaim[],
): { readonly kept: SpeedAvoidableClaim[]; readonly dropped: SpeedAvoidableClaim[] } => {
  const best = new Map<string, SpeedAvoidableClaim>()
  const dropped: SpeedAvoidableClaim[] = []
  for (const claim of claims) {
    const previous = best.get(claimKey(claim))
    if (!previous) {
      best.set(claimKey(claim), claim)
      continue
    }
    const byStrength = strengthRank[previous.evidence] - strengthRank[claim.evidence]
    const winner =
      byStrength !== 0 ? (byStrength < 0 ? previous : claim) : previous.removedNs >= claim.removedNs ? previous : claim
    best.set(claimKey(claim), winner)
    dropped.push(winner === previous ? claim : previous)
  }
  return { kept: [...best.values()], dropped }
}

/**
 * Drops a claim whose span sits under another claimed span in the same trace.
 *
 * Removing an ancestor already removes everything under it, so charging the descendant as well
 * would count one stretch of the path twice.
 */
const dropCoveredDescendants = (
  claims: readonly SpeedAvoidableClaim[],
  pathsByTrace: ReadonlyMap<string, TraceCriticalPath>,
): { readonly kept: SpeedAvoidableClaim[]; readonly covered: SpeedAvoidableClaim[] } => {
  const kept: SpeedAvoidableClaim[] = []
  const covered: SpeedAvoidableClaim[] = []
  for (const claim of claims) {
    const ancestors = pathsByTrace.get(claim.traceId)?.ancestorIdsBySpanId.get(claim.spanId)
    const shadowed = claims.some(
      (other) => other !== claim && other.traceId === claim.traceId && ancestors?.has(other.spanId) === true,
    )
    if (shadowed) covered.push(claim)
    else kept.push(claim)
  }
  return { kept, covered }
}

const resolveNs = ({
  claim,
  path,
  scenario,
}: {
  readonly claim: SpeedAvoidableClaim
  readonly path: TraceCriticalPath
  readonly scenario: SpeedScenario
}): number => {
  const claimed =
    scenario === "point"
      ? claim.removedNs
      : scenario === "lower"
        ? (claim.bounds?.lowerNs ?? claim.removedNs)
        : (claim.bounds?.upperNs ?? claim.removedNs)
  return Math.max(0, Math.min(claimed, marginalCriticalPathNs({ path, spanId: claim.spanId })))
}

const SPEED_SCENARIOS = ["point", "lower", "upper"] as const
type SpeedScenario = (typeof SPEED_SCENARIOS)[number]

/**
 * The session's avoidable critical-path time, from the segments its observations can actually claim.
 *
 * Every step exists to keep one stretch of wall clock from being charged more than once: dedupe by
 * span, drop descendants of claimed spans, cap each claim by the marginal time its subtree held,
 * then clamp the total to the observed path. Concurrent work contributes nothing on its own, which
 * under-counts rather than over-counts — the safe direction for a penalty.
 *
 * Bounds come from rerunning the whole composition under each scenario rather than summing item
 * bounds, so the dedup and the caps apply to the low and high cases too.
 */
export const composeSpeedCounterfactual = ({
  criticalPath,
  claims,
}: {
  readonly criticalPath: SessionCriticalPath
  readonly claims: readonly SpeedAvoidableClaim[]
}): SpeedCounterfactual => {
  const pathsByTrace = new Map(
    criticalPath.traces
      .filter((trace) => trace.completeness !== "notApplicable")
      .map((trace) => [trace.traceId, trace]),
  )
  const observedNs = criticalPath.observedNs

  const withPath = claims.filter((claim) => pathsByTrace.has(claim.traceId))
  const noPath = claims.filter((claim) => !pathsByTrace.has(claim.traceId))
  const { kept: unique, dropped: superseded } = dedupeBySpan(withPath)
  const { kept: independent, covered } = dropCoveredDescendants(unique, pathsByTrace)

  const totalFor = (scenario: SpeedScenario): number => {
    const total = independent.reduce((sum, claim) => {
      const path = pathsByTrace.get(claim.traceId)
      return path ? sum + resolveNs({ claim, path, scenario }) : sum
    }, 0)
    return Math.min(observedNs, total)
  }

  const avoidableNs = totalFor("point")
  const applied = independent.filter((claim) => {
    const path = pathsByTrace.get(claim.traceId)
    return path ? resolveNs({ claim, path, scenario: "point" }) > 0 : false
  })
  const offPath = independent.filter((claim) => !applied.includes(claim))
  const exactNs = Math.min(
    avoidableNs,
    applied
      .filter((claim) => claim.evidence === "confirmed")
      .reduce((sum, claim) => {
        const path = pathsByTrace.get(claim.traceId)
        return path ? sum + resolveNs({ claim, path, scenario: "point" }) : sum
      }, 0),
  )

  return {
    observedNs,
    avoidableNs,
    measuredAvoidableNs: exactNs,
    estimatedAvoidableNs: Math.max(0, avoidableNs - exactNs),
    nativeImpact: {
      unit: "nanoseconds",
      point: avoidableNs,
      lower: totalFor("lower"),
      upper: totalFor("upper"),
      interpretation: "identificationBound",
    },
    appliedClaims: applied,
    droppedClaims: [
      ...noPath.map((claim) => ({ claim, reason: "noPath" as const })),
      ...superseded.map((claim) => ({ claim, reason: "supersededByExact" as const })),
      ...covered.map((claim) => ({ claim, reason: "coveredByAncestor" as const })),
      ...offPath.map((claim) => ({ claim, reason: "offCriticalPath" as const })),
    ],
    usableForDenominator: criticalPath.completeness === "complete",
  }
}
