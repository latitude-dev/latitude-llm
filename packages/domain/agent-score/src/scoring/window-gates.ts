import type { CostCoverageFloors, SpeedCoverageFloors } from "../entities/agent-score-artifact.ts"
import { COST_FAMILIES, type CostFamily } from "../entities/cost-evidence.ts"
import type { CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"
import type { WindowSpeedAggregate } from "./bootstrap-window.ts"
import type { WindowFold } from "./fold-window-contributions.ts"
import type { WindowReaderCoverage } from "./tally-reader-coverage.ts"

export type CostUnmeasuredReason = "requiredFamilyUnreadable" | "publishableSessionFloor" | "noReadableSessions"

export interface CostFamilyWindowCoverage {
  readonly family: CostFamily
  readonly required: boolean
  readonly applicableReadings: number
  readonly readableReadings: number
  /** Readable share of the family's applicable readings; 1 when the family applies to nothing. */
  readonly coverage: number
  readonly meetsCoverageFloor: boolean
}

export interface CostWindowGate {
  readonly coverage: "measured" | "unmeasured"
  readonly unmeasuredReason?: CostUnmeasuredReason
  readonly families: readonly CostFamilyWindowCoverage[]
  readonly publishableSessionCount: number
  readonly withheldSessionCount: number
  readonly publishableSessionShare: number
}

/**
 * Whether the window has enough readable Cost evidence to publish a number.
 *
 * The session-level check already drops a session whose required family could not be read, and on
 * its own that is the wrong answer at window scale: dropping those sessions shrinks the denominator
 * until the remaining, readable sessions look like the whole story. So the same fact is asked twice,
 * once per session to decide what may contribute and once per window to decide whether contributing
 * sessions describe the project at all. A family that applies nowhere is not a coverage failure; a
 * family that applies and cannot be read is, and it withholds Cost rather than being averaged away.
 */
export const gateCostWindow = ({
  fold,
  artifact,
  floors,
}: {
  readonly fold: WindowFold
  readonly artifact: CostScoringArtifact
  readonly floors: CostCoverageFloors
}): CostWindowGate => {
  const families = COST_FAMILIES.map((family): CostFamilyWindowCoverage => {
    const counted = fold.familyCoverage[family]
    const requirement = artifact.familyCoverageRequirements[family]
    const coverage = counted.applicable === 0 ? 1 : counted.readable / counted.applicable
    return {
      family,
      required: requirement.required,
      applicableReadings: counted.applicable,
      readableReadings: counted.readable,
      coverage,
      meetsCoverageFloor: coverage >= requirement.coverageFloor,
    }
  })

  const publishableSessionCount = fold.foldedSessionCount
  const consideredSessionCount = publishableSessionCount + fold.withheldSessionCount
  const publishableSessionShare = consideredSessionCount > 0 ? publishableSessionCount / consideredSessionCount : 0
  const base = {
    families,
    publishableSessionCount,
    withheldSessionCount: fold.withheldSessionCount,
    publishableSessionShare,
  }

  const unreadableRequiredFamily = families.some(
    (family) => family.required && family.applicableReadings > 0 && !family.meetsCoverageFloor,
  )
  if (unreadableRequiredFamily) {
    return { ...base, coverage: "unmeasured", unmeasuredReason: "requiredFamilyUnreadable" }
  }
  if (publishableSessionCount === 0) {
    return { ...base, coverage: "unmeasured", unmeasuredReason: "noReadableSessions" }
  }
  if (publishableSessionShare < floors.publishableSessionShare) {
    return { ...base, coverage: "unmeasured", unmeasuredReason: "publishableSessionFloor" }
  }
  return { ...base, coverage: "measured" }
}

export type SpeedUnmeasuredReason =
  | "completePathFloor"
  | "completePathCoverageFloor"
  | "latencyReferenceCoverage"
  | "noObservedTime"

export interface SpeedWindowGate {
  readonly coverage: "measured" | "unmeasured"
  readonly unmeasuredReason?: SpeedUnmeasuredReason
  readonly completeSessionCount: number
  readonly incompleteSessionCount: number
  readonly completeShareOfEligible: number
}

/**
 * Whether enough of the window's critical paths reconstructed to divide by them.
 *
 * A session whose path did not reconstruct is excluded from both sides of the ratio, so a project
 * where reconstruction rarely succeeds would otherwise report the Speed of the handful of sessions
 * that happened to be readable. Observed time of zero is its own gate: dividing avoidable time by
 * nothing would read as either perfect or undefined, and neither is a measurement.
 */
export const gateSpeedWindow = ({
  speed,
  eligibleSessionCount,
  latencyReaderCoverage,
  floors,
}: {
  readonly speed: WindowSpeedAggregate
  readonly eligibleSessionCount: number
  readonly latencyReaderCoverage: readonly WindowReaderCoverage[]
  readonly floors: SpeedCoverageFloors
}): SpeedWindowGate => {
  const completeShareOfEligible = eligibleSessionCount > 0 ? speed.includedSessionCount / eligibleSessionCount : 0
  const base = {
    completeSessionCount: speed.includedSessionCount,
    incompleteSessionCount: speed.excludedSessionCount,
    completeShareOfEligible,
  }

  if (speed.includedSessionCount < floors.completeCriticalPathSessions) {
    return { ...base, coverage: "unmeasured", unmeasuredReason: "completePathFloor" }
  }
  if (completeShareOfEligible < floors.completeCriticalPathShareOfEligible) {
    return { ...base, coverage: "unmeasured", unmeasuredReason: "completePathCoverageFloor" }
  }
  if (latencyReaderCoverage.some((reader) => reader.readableUnits < reader.applicableUnits)) {
    return { ...base, coverage: "unmeasured", unmeasuredReason: "latencyReferenceCoverage" }
  }
  if (speed.observedNs <= 0) {
    return { ...base, coverage: "unmeasured", unmeasuredReason: "noObservedTime" }
  }
  return { ...base, coverage: "measured" }
}
