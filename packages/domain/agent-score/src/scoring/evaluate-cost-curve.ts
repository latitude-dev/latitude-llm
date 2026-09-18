import type { CostMetricEvaluation, CostMetricHealth, CostSourceClaim } from "../entities/cost-evidence.ts"
import type { CostMetricReading } from "../entities/cost-metric-reading.ts"
import type { CostMetricCurve, CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"

/**
 * The penalty a raw value earns, linearly interpolated between the curve's points and clamped
 * outside the first and last.
 *
 * Piecewise-linear rather than stepped on purpose: a step at the edge of the safe range would make
 * two nearly identical sessions score differently for no measured reason. Monotonicity is the
 * curve's own invariant — the artifact refuses non-decreasing penalties — so this never has to
 * defend against a curve that rewards getting worse.
 */
export const interpolateCostPenalty = ({
  curve,
  rawValue,
}: {
  readonly curve: CostMetricCurve
  readonly rawValue: number
}): number => {
  const points = curve.points
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return 0
  if (rawValue <= first.rawValue) return first.penalty
  if (rawValue >= last.rawValue) return last.penalty

  for (let index = 1; index < points.length; index += 1) {
    const lower = points[index - 1] as (typeof points)[number]
    const upper = points[index] as (typeof points)[number]
    if (rawValue > upper.rawValue) continue
    const span = upper.rawValue - lower.rawValue
    if (span <= 0) return upper.penalty
    const position = (rawValue - lower.rawValue) / span
    return lower.penalty + position * (upper.penalty - lower.penalty)
  }
  return last.penalty
}

/** Which named range a raw value falls in. The labels are the curve's, not a reader's judgement. */
export const costHealthForRawValue = ({
  curve,
  rawValue,
}: {
  readonly curve: CostMetricCurve
  readonly rawValue: number
}): CostMetricHealth => {
  if (rawValue <= curve.healthyMaxRawValue) return "healthy"
  return rawValue <= curve.watchMaxRawValue ? "watch" : "poor"
}

/**
 * Turns a reader's observation into a scored evaluation.
 *
 * The reading supplies the raw value in the metric's own unit; the penalty it earns is charged
 * against the *family's* canonical denominator, which is why `familyEligibleUnits` comes from the
 * session rather than from the metric. Per-atom claims split the penalized units by how adverse
 * each atom actually was, so arbitration downstream can drop a claim on an atom another metric
 * already owns without re-deriving anything.
 */
export const evaluateCostMetric = ({
  reading,
  artifact,
  curveId,
  familyEligibleUnits,
}: {
  readonly reading: CostMetricReading
  readonly artifact: CostScoringArtifact
  readonly curveId: string
  readonly familyEligibleUnits: number
}): CostMetricEvaluation => {
  const base = {
    metricId: reading.metricId,
    family: reading.family,
    rawUnit: reading.rawUnit,
    aggregation: reading.aggregation,
    applicability: reading.applicability,
    readability: reading.readability,
    ...(reading.nativeImpact !== undefined ? { nativeImpact: reading.nativeImpact } : {}),
  }
  if (reading.applicability === "notApplicable") return { ...base, sourceClaims: [] }
  if (reading.readability === "unreadable") {
    return {
      ...base,
      ...(reading.eligibleUnits !== undefined ? { eligibleUnits: reading.eligibleUnits } : {}),
      sourceClaims: [],
    }
  }

  const curve = artifact.metricCurves.find((candidate) => candidate.curveId === curveId)
  const rawValue = reading.rawValue ?? 0
  if (!curve) {
    return { ...base, readability: "unreadable", eligibleUnits: familyEligibleUnits, sourceClaims: [] }
  }

  const metricCap = artifact.metricCaps[reading.metricId] ?? 1
  const penalty = Math.min(metricCap, interpolateCostPenalty({ curve, rawValue }))
  const penalizedTotal = penalty * familyEligibleUnits
  const adverseTotal = reading.observations.reduce((total, observation) => total + observation.adverseUnits, 0)
  const sourceClaims: CostSourceClaim[] =
    adverseTotal > 0
      ? reading.observations
          .filter((observation) => observation.adverseUnits > 0)
          .map((observation) => ({
            atomId: observation.atomId,
            eligibleUnits: observation.eligibleUnits,
            penalizedUnits: Math.min(
              observation.eligibleUnits,
              penalizedTotal * (observation.adverseUnits / adverseTotal),
            ),
          }))
      : []

  return {
    ...base,
    rawValue,
    status: costHealthForRawValue({ curve, rawValue }),
    penalty,
    eligibleUnits: familyEligibleUnits,
    penalizedUnits: Math.min(familyEligibleUnits, penalizedTotal),
    sourceClaims,
  }
}
