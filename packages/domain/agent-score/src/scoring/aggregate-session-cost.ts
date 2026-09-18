import { COST_FAMILIES, type CostFamily, type CostMeasurementStatus } from "../entities/cost-evidence.ts"
import type { CostMetricCatalog } from "../entities/cost-metric-catalog.ts"
import type { CostMetricReading } from "../entities/cost-metric-reading.ts"
import type { CostOverlapPolicy, CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"
import { arbitrateCostAtoms } from "./arbitrate-cost-atoms.ts"
import { costHealthForRawValue, interpolateCostPenalty } from "./evaluate-cost-curve.ts"

/**
 * Each family's canonical denominator for one session, in the units `score.md` fixes.
 *
 * Supplied by the session's readers rather than derived from a metric: a metric states a raw value
 * in its own unit, and its penalty is charged against the family's denominator. Zero means the
 * family has nothing eligible, which is not the same as healthy.
 */
export interface CostFamilyDenominators {
  readonly spend: number
  readonly context: number
  readonly tools: number
  readonly memory: number
  readonly recovery: number
}

/** No family has anything eligible: contributes neither penalty nor denominator. */
export const EMPTY_COST_FAMILY_DENOMINATORS: CostFamilyDenominators = {
  spend: 0,
  context: 0,
  tools: 0,
  memory: 0,
  recovery: 0,
}

export interface CostFamilyResult {
  readonly family: CostFamily
  readonly status: CostMeasurementStatus
  readonly penalty: number
  readonly eligibleUnits: number
  readonly penalizedUnits: number
  readonly applicableMetricCount: number
  readonly readableMetricCount: number
  /** Readable share of the family's applicable metrics; 1 when nothing applies. */
  readonly coverage: number
  readonly meetsCoverageFloor: boolean
  readonly required: boolean
}

export interface SessionCostAggregate {
  readonly families: readonly CostFamilyResult[]
  /** Weighted family penalties plus any residual signal penalty, clamped to 0 through 1. */
  readonly costPenalty: number
  /**
   * Whether a Cost number may be published for this session's window contribution. False when a
   * required family applies but cannot be read well enough — coverage is never success.
   */
  readonly publishable: boolean
  readonly withheldFamilies: readonly CostFamily[]
  /**
   * Each metric's resolved penalty share, after arbitration, caps and overlap policies.
   *
   * The family totals lose which metric produced them, and attribution has to put a number beside a
   * cause name rather than beside a family, so the breakdown is carried out rather than recomputed.
   */
  readonly penaltiesByMetric: ReadonlyMap<string, number>
}

const familyOf = (denominators: CostFamilyDenominators, family: CostFamily): number => denominators[family]

const worstStatus = (statuses: readonly CostMeasurementStatus[]): CostMeasurementStatus => {
  const precedence: readonly CostMeasurementStatus[] = ["poor", "watch", "unmeasured", "healthy", "notApplicable"]
  return precedence.find((candidate) => statuses.includes(candidate)) ?? "unmeasured"
}

const appliesTo = (policy: CostOverlapPolicy, metricId: string, overlapGroup: string): boolean =>
  policy.metricIds.includes(metricId) || policy.overlapGroups.includes(overlapGroup)

/**
 * Applies the artifact's overlap policies to a set of already-arbitrated metric penalties.
 *
 * Atom arbitration stops one resource being charged twice; a policy stops two *views* of the same
 * behaviour adding up past what the group is allowed to claim. `combinedCap` is the cross-family
 * case: cache tokens and the modeled savings derived from them share one ceiling, so a saving that
 * exists only because of the token gap cannot be charged again as money.
 */
const applyOverlapPolicies = ({
  penaltiesByMetric,
  artifact,
  catalog,
}: {
  readonly penaltiesByMetric: ReadonlyMap<string, number>
  readonly artifact: CostScoringArtifact
  readonly catalog: CostMetricCatalog
}): Map<string, number> => {
  const overlapGroupByMetric = new Map(catalog.entries.map((entry) => [entry.metricId, entry.overlapGroup]))
  const resolved = new Map(penaltiesByMetric)

  for (const policy of artifact.overlapPolicies) {
    const members = [...resolved.entries()].filter(([metricId]) =>
      appliesTo(policy, metricId, overlapGroupByMetric.get(metricId) ?? ""),
    )
    if (members.length === 0) continue
    const total = members.reduce((sum, [, penalty]) => sum + penalty, 0)
    if (total <= 0) continue

    const ceiling =
      policy.resolution === "combinedCap"
        ? (policy.combinedCap ?? total)
        : policy.resolution === "maximum" || policy.resolution === "exactFirst"
          ? Math.max(...members.map(([, penalty]) => penalty))
          : total
    if (total <= ceiling) continue
    for (const [metricId, penalty] of members) resolved.set(metricId, penalty * (ceiling / total))
  }

  return resolved
}

/**
 * The session's Cost contribution: one penalty per family, then the fixed weighted mix.
 *
 * Weights never redistribute. A family with nothing applicable contributes a zero penalty at its
 * full weight, which is the session being credited for not incurring that cost class — not a
 * reallocation of influence to whatever the session did do.
 */
export const aggregateSessionCost = ({
  readings,
  artifact,
  catalog,
  denominators,
  residualSignalPenalty = 0,
}: {
  readonly readings: readonly CostMetricReading[]
  readonly artifact: CostScoringArtifact
  readonly catalog: CostMetricCatalog
  readonly denominators: CostFamilyDenominators
  readonly residualSignalPenalty?: number
}): SessionCostAggregate => {
  const curveIdByMetric = new Map(catalog.entries.map((entry) => [entry.metricId, entry.curveId]))
  const arbitration = arbitrateCostAtoms(readings)

  const rawPenalties = new Map<string, number>()
  const statusesByFamily = new Map<CostFamily, CostMeasurementStatus[]>()

  for (const { reading, effectiveRawValue } of arbitration.readings) {
    const statuses = statusesByFamily.get(reading.family) ?? []
    if (reading.applicability === "notApplicable") {
      statuses.push("notApplicable")
      statusesByFamily.set(reading.family, statuses)
      continue
    }
    const curve = artifact.metricCurves.find((candidate) => candidate.curveId === curveIdByMetric.get(reading.metricId))
    if (reading.readability === "unreadable" || !curve) {
      statuses.push("unmeasured")
      statusesByFamily.set(reading.family, statuses)
      continue
    }
    const cap = artifact.metricCaps[reading.metricId] ?? 1
    rawPenalties.set(reading.metricId, Math.min(cap, interpolateCostPenalty({ curve, rawValue: effectiveRawValue })))
    statuses.push(costHealthForRawValue({ curve, rawValue: effectiveRawValue }))
    statusesByFamily.set(reading.family, statuses)
  }

  const resolved = applyOverlapPolicies({ penaltiesByMetric: rawPenalties, artifact, catalog })
  const familyOfMetric = new Map(readings.map((reading) => [reading.metricId, reading.family]))

  const families = COST_FAMILIES.map((family): CostFamilyResult => {
    const familyReadings = readings.filter((reading) => reading.family === family)
    const applicable = familyReadings.filter((reading) => reading.applicability === "applicable")
    const readable = applicable.filter((reading) => reading.readability === "readable")
    const eligibleUnits = familyOf(denominators, family)
    const summedPenalty = [...resolved.entries()]
      .filter(([metricId]) => familyOfMetric.get(metricId) === family)
      .reduce((total, [, penalty]) => total + penalty, 0)
    const penalty = Math.min(artifact.familyCaps[family], Math.max(0, Math.min(1, summedPenalty)))
    const requirement = artifact.familyCoverageRequirements[family]
    const coverage = applicable.length === 0 ? 1 : readable.length / applicable.length

    return {
      family,
      status: worstStatus(statusesByFamily.get(family) ?? []),
      penalty: eligibleUnits > 0 ? penalty : 0,
      eligibleUnits,
      penalizedUnits: eligibleUnits > 0 ? penalty * eligibleUnits : 0,
      applicableMetricCount: applicable.length,
      readableMetricCount: readable.length,
      coverage,
      meetsCoverageFloor: coverage >= requirement.coverageFloor,
      required: requirement.required,
    }
  })

  const withheldFamilies = families
    .filter((result) => result.required && result.applicableMetricCount > 0 && !result.meetsCoverageFloor)
    .map((result) => result.family)
  const weighted = families.reduce((total, result) => total + artifact.familyWeights[result.family] * result.penalty, 0)

  return {
    families,
    costPenalty: Math.max(0, Math.min(1, weighted + residualSignalPenalty)),
    publishable: withheldFamilies.length === 0,
    withheldFamilies,
    penaltiesByMetric: resolved,
  }
}
