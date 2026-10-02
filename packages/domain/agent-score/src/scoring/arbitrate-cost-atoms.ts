import type { CostFamily } from "../entities/cost-evidence.ts"
import type { CostEvidenceStrength, CostMetricReading } from "../entities/cost-metric-reading.ts"

/** One metric's claim on one atom, as arbitration sees it. */
interface AtomClaim {
  readonly metricId: string
  readonly family: CostFamily
  readonly atomId: string
  readonly adverseUnits: number
  /** The claiming metric's whole itemized claim, so a tie is broken by which finding explains more. */
  readonly metricAdverseUnits: number
  readonly evidence: CostEvidenceStrength
}

export interface ArbitratedReading {
  readonly reading: CostMetricReading
  /** Adverse units left after atoms another metric owns are removed. */
  readonly effectiveAdverseUnits: number
  /** The reading's raw value scaled by what it kept. Zero when it lost every atom. */
  readonly effectiveRawValue: number
  readonly ownedAtomIds: readonly string[]
  readonly cededAtomIds: readonly string[]
}

export interface CostAtomArbitration {
  readonly readings: readonly ArbitratedReading[]
  /** Family → the atoms that family charges, each owned by exactly one metric. */
  readonly ownedAtomsByFamily: ReadonlyMap<CostFamily, ReadonlySet<string>>
}

const strengthRank: Readonly<Record<CostEvidenceStrength, number>> = { confirmed: 0, modeled: 1 }

/**
 * Which of two claims on the same atom keeps it.
 *
 * Exact evidence wins outright: a proven attribution beats an estimate however large the estimate
 * is, because the estimate's size is itself uncertain. Between two claims of the same strength the
 * larger claim on the atom wins; when those tie, the metric that explains more of the session does,
 * so a loop covering five calls keeps them rather than losing them to a reader covering two. The
 * metric id is the last resort, purely so the outcome is deterministic.
 */
const preferredClaim = (left: AtomClaim, right: AtomClaim): AtomClaim => {
  const byStrength = strengthRank[left.evidence] - strengthRank[right.evidence]
  if (byStrength !== 0) return byStrength < 0 ? left : right
  if (left.adverseUnits !== right.adverseUnits) return left.adverseUnits > right.adverseUnits ? left : right
  if (left.metricAdverseUnits !== right.metricAdverseUnits) {
    return left.metricAdverseUnits > right.metricAdverseUnits ? left : right
  }
  return left.metricId <= right.metricId ? left : right
}

const claimsOf = (reading: CostMetricReading): AtomClaim[] => {
  if (reading.applicability === "notApplicable" || reading.readability === "unreadable") return []
  const blamed = reading.observations.filter((observation) => observation.adverseUnits > 0)
  const metricAdverseUnits = blamed.reduce((total, observation) => total + observation.adverseUnits, 0)
  return blamed.map((observation) => ({
    metricId: reading.metricId,
    family: reading.family,
    atomId: observation.atomId,
    adverseUnits: observation.adverseUnits,
    metricAdverseUnits,
    evidence: reading.evidence ?? "modeled",
  }))
}

/**
 * Resolves every metric's claims so one resource is charged once per family.
 *
 * Arbitration is per family, not global: the same tool call can be a `tools` inefficiency and the
 * tokens its payload occupies can be `context` waste, because those are genuinely different
 * resources measured in different units. What it cannot be is two tool-family penalties.
 *
 * A metric that loses atoms keeps the rest, scaled: five repeats of which three form a loop leave
 * the repetition reader charging two, so the family sees five once rather than eight or three.
 */
export const arbitrateCostAtoms = (readings: readonly CostMetricReading[]): CostAtomArbitration => {
  const winners = new Map<string, AtomClaim>()
  for (const claim of readings.flatMap(claimsOf)) {
    const key = `${claim.family} ${claim.atomId}`
    const previous = winners.get(key)
    winners.set(key, previous ? preferredClaim(previous, claim) : claim)
  }

  const ownedAtomsByFamily = new Map<CostFamily, Set<string>>()
  for (const claim of winners.values()) {
    const owned = ownedAtomsByFamily.get(claim.family) ?? new Set<string>()
    owned.add(claim.atomId)
    ownedAtomsByFamily.set(claim.family, owned)
  }

  const arbitrated = readings.map((reading): ArbitratedReading => {
    const claims = claimsOf(reading)
    const kept = claims.filter((claim) => winners.get(`${claim.family} ${claim.atomId}`)?.metricId === claim.metricId)
    const effectiveAdverseUnits = kept.reduce((total, claim) => total + claim.adverseUnits, 0)
    const itemized = claims.reduce((total, claim) => total + claim.adverseUnits, 0)
    // Scaled by the share of its *own* itemized claim the metric kept. A reader that blames a total
    // without itemizing it has nothing to arbitrate away, so it keeps its raw value intact.
    const attenuation = itemized > 0 ? effectiveAdverseUnits / itemized : 1
    return {
      reading,
      effectiveAdverseUnits,
      effectiveRawValue: (reading.rawValue ?? 0) * attenuation,
      ownedAtomIds: kept.map((claim) => claim.atomId),
      cededAtomIds: claims.filter((claim) => !kept.includes(claim)).map((claim) => claim.atomId),
    }
  })

  return { readings: arbitrated, ownedAtomsByFamily }
}
