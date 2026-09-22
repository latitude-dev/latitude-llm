import { type OrganizationId, type ProjectId, SCORE_DIMENSIONS, type ScoreDimension } from "@domain/shared"
import type { AgentScoreSnapshot, DimensionSnapshot } from "./agent-score-snapshot.ts"

const MAX_DIMENSION_SPREAD = 9

const INTERVAL_HALF_WIDTH = 4

/** FNV-1a, so the same project and date always produce the same shape without importing a PRNG. */
const hashUnit = (key: string): number => {
  let hash = 0x81_1c_9d_c5
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0
  }
  return hash / 0x1_00_00_00_00
}

const clamp = (value: number): number => Math.max(0, Math.min(100, value))

/** A band that never leaves [0, 100], so an interval around 98 or 2 is still well formed. */
const intervalAround = (value: number): DimensionSnapshot["interval"] => {
  const halfWidth = Math.min(INTERVAL_HALF_WIDTH, value, 100 - value)
  return { lower: clamp(value - halfWidth), upper: clamp(value + halfWidth) }
}

/** Weight-centred offsets, scaled to stay inside [0, 100] — a clamp here would break the mean. */
const scatterDimensions = ({
  score,
  weights,
  seed,
}: {
  readonly score: number
  readonly weights: Readonly<Record<ScoreDimension, number>>
  readonly seed: string
}): Record<ScoreDimension, number> => {
  const totalWeight = SCORE_DIMENSIONS.reduce((total, dimension) => total + Math.max(0, weights[dimension]), 0)
  const share = (dimension: ScoreDimension): number =>
    totalWeight > 0 ? Math.max(0, weights[dimension]) / totalWeight : 1 / SCORE_DIMENSIONS.length

  const raw = SCORE_DIMENSIONS.map((dimension) => hashUnit(`${seed}:${dimension}`) * 2 - 1)
  const weightedMean = SCORE_DIMENSIONS.reduce((total, dimension, index) => total + share(dimension) * raw[index]!, 0)
  const centred = raw.map((offset) => offset - weightedMean)
  const largest = centred.reduce((max, offset) => Math.max(max, Math.abs(offset)), 0)
  const spread = Math.min(MAX_DIMENSION_SPREAD, score, 100 - score)
  const scale = largest > 1e-9 ? spread / largest : 0

  return Object.fromEntries(
    SCORE_DIMENSIONS.map((dimension, index) => [dimension, score + centred[index]! * scale]),
  ) as Record<ScoreDimension, number>
}

export interface SyntheticAgentScoreSnapshotInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** UTC date, `YYYY-MM-DD`. */
  readonly date: string
  readonly score: number
  readonly scoringVersion: string
  readonly windowDays: number
  readonly eligibleSessionCount: number
  readonly weights: Readonly<Record<ScoreDimension, number>>
  readonly createdAt: Date
}

/** Carries no explanation: readers must see "no evidence" rather than invented causes. */
export const syntheticAgentScoreSnapshot = (input: SyntheticAgentScoreSnapshotInput): AgentScoreSnapshot => {
  const score = clamp(input.score)
  const dimensionScores = scatterDimensions({
    score,
    weights: input.weights,
    seed: `${input.projectId}:${input.date}`,
  })

  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    date: input.date,
    scoringVersion: input.scoringVersion,
    windowDays: input.windowDays,
    eligibleSessionCount: input.eligibleSessionCount,
    score,
    interval: intervalAround(score),
    dimensions: Object.fromEntries(
      SCORE_DIMENSIONS.map((dimension) => [
        dimension,
        { score: dimensionScores[dimension], interval: intervalAround(dimensionScores[dimension]) },
      ]),
    ) as Record<ScoreDimension, DimensionSnapshot>,
    createdAt: input.createdAt,
  }
}
