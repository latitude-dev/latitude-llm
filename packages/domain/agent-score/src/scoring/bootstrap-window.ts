import { COST_FAMILIES, type CostFamily } from "../entities/cost-evidence.ts"
import type { CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"
import type { CostFamilyResult } from "./aggregate-session-cost.ts"

/**
 * What one session contributes to a window, in the units the window aggregates.
 *
 * Deliberately the per-family unit counts rather than the session's own penalty: a window's family
 * penalty is `Σ penalized / Σ eligible` across sessions, so averaging session penalties would
 * weight a one-call session the same as a thousand-call one.
 */
export interface SessionWindowContribution {
  readonly sessionId: string
  /** False when a required Cost family was unreadable; excluded from Cost but retained for Speed. */
  readonly costUsableForDenominator: boolean
  readonly families: readonly Pick<CostFamilyResult, "family" | "eligibleUnits" | "penalizedUnits">[]
  readonly speed: {
    readonly observedNs: number
    readonly avoidableNs: number
    /** False when the session's critical path did not reconstruct; excluded from Speed entirely. */
    readonly usableForDenominator: boolean
  }
}

export interface WindowCostAggregate {
  readonly familyPenalties: Readonly<Record<CostFamily, number>>
  readonly costPenalty: number
  readonly cost: number
}

export interface WindowSpeedAggregate {
  readonly observedNs: number
  readonly avoidableNs: number
  readonly speed: number
  readonly includedSessionCount: number
  readonly excludedSessionCount: number
}

const ratio = (numerator: number, denominator: number): number =>
  denominator > 0 ? Math.max(0, Math.min(1, numerator / denominator)) : 0

/**
 * The window's Cost, pooled over sessions rather than averaged over them.
 *
 * Each family's eligible atoms are already unique per session, so summing them across sessions is
 * the window denominator. The five fixed weights then apply once, at the end.
 */
export const aggregateWindowCost = ({
  contributions,
  artifact,
  residualSignalPenalty = 0,
}: {
  readonly contributions: readonly SessionWindowContribution[]
  readonly artifact: CostScoringArtifact
  readonly residualSignalPenalty?: number
}): WindowCostAggregate => {
  const familyPenalties = Object.fromEntries(
    COST_FAMILIES.map((family) => {
      const rows = contributions
        .filter((contribution) => contribution.costUsableForDenominator)
        .flatMap((contribution) => contribution.families.filter((entry) => entry.family === family))
      const eligible = rows.reduce((total, entry) => total + entry.eligibleUnits, 0)
      const penalized = rows.reduce((total, entry) => total + entry.penalizedUnits, 0)
      return [family, Math.min(artifact.familyCaps[family], ratio(penalized, eligible))]
    }),
  ) as Record<CostFamily, number>

  const weighted = COST_FAMILIES.reduce(
    (total, family) => total + artifact.familyWeights[family] * familyPenalties[family],
    0,
  )
  const costPenalty = Math.max(0, Math.min(1, weighted + residualSignalPenalty))

  return { familyPenalties, costPenalty, cost: 100 * (1 - costPenalty) }
}

/**
 * The window's Speed: avoidable critical-path time over observed critical-path time.
 *
 * Only sessions whose path reconstructed are in either side of the ratio. An exact reading from an
 * incomplete session stays visible on that session, but letting it into the window would divide by
 * time nobody could measure — which would read as necessary.
 */
export const aggregateWindowSpeed = (
  contributions: readonly SessionWindowContribution[],
  residualAvoidableNs = 0,
): WindowSpeedAggregate => {
  const included = contributions.filter((contribution) => contribution.speed.usableForDenominator)
  const observedNs = included.reduce((total, contribution) => total + contribution.speed.observedNs, 0)
  // Clamped to observed time, which is what stops a modelled signal effect claiming time nobody spent.
  const avoidableNs = Math.min(
    observedNs,
    included.reduce((total, contribution) => total + contribution.speed.avoidableNs, 0) +
      Math.max(0, residualAvoidableNs),
  )

  return {
    observedNs,
    avoidableNs,
    speed: 100 * (1 - ratio(avoidableNs, observedNs)),
    includedSessionCount: included.length,
    excludedSessionCount: contributions.length - included.length,
  }
}

/** Mulberry32: a small seeded generator, so a replicate set is reproducible from the seed alone. */
const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

const percentile = (sorted: readonly number[], fraction: number): number => {
  if (sorted.length === 0) return 0
  const position = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))))
  return sorted[position] as number
}

export interface WindowConfidenceInterval {
  readonly point: number
  readonly lower: number
  readonly upper: number
  readonly replicates: number
}

export interface WindowBootstrapResult {
  readonly cost: WindowConfidenceInterval
  readonly speed: WindowConfidenceInterval
}

/**
 * Bootstrap interval for a window, by resampling whole sessions and re-aggregating each replicate.
 *
 * Sessions are the resampling unit because they are the independent observation: a session's own
 * metrics are correlated with each other, so resampling metrics would understate the interval.
 * Every replicate re-runs the pooled ratio rather than averaging session numbers, and item-level
 * bounds are never summed — the interval comes from how much the window moves when its session mix
 * changes, which is the question a confidence interval answers.
 *
 * Deterministic: the same contributions and seed reproduce the same interval, which is what lets a
 * shadow run be compared with its rerun.
 */
export const bootstrapWindow = ({
  contributions,
  artifact,
  replicates = 200,
  seed = 1,
  interval = 0.95,
}: {
  readonly contributions: readonly SessionWindowContribution[]
  readonly artifact: CostScoringArtifact
  readonly replicates?: number
  readonly seed?: number
  readonly interval?: number
}): WindowBootstrapResult => {
  const pointCost = aggregateWindowCost({ contributions, artifact }).cost
  const pointSpeed = aggregateWindowSpeed(contributions).speed
  if (contributions.length === 0) {
    const empty = { point: 0, lower: 0, upper: 0, replicates: 0 }
    return { cost: { ...empty, point: pointCost }, speed: { ...empty, point: pointSpeed } }
  }

  const random = seededRandom(seed)
  const costs: number[] = []
  const speeds: number[] = []
  for (let replicate = 0; replicate < replicates; replicate += 1) {
    const resampled = Array.from(
      { length: contributions.length },
      () => contributions[Math.floor(random() * contributions.length)] as SessionWindowContribution,
    )
    costs.push(aggregateWindowCost({ contributions: resampled, artifact }).cost)
    speeds.push(aggregateWindowSpeed(resampled).speed)
  }

  costs.sort((left, right) => left - right)
  speeds.sort((left, right) => left - right)
  const tail = (1 - interval) / 2

  return {
    cost: {
      point: pointCost,
      lower: percentile(costs, tail),
      upper: percentile(costs, 1 - tail),
      replicates,
    },
    speed: {
      point: pointSpeed,
      lower: percentile(speeds, tail),
      upper: percentile(speeds, 1 - tail),
      replicates,
    },
  }
}
