import { type OrganizationId, type ProjectId, SCORE_DIMENSIONS, type ScoreDimension } from "@domain/shared"
import type { AgentScoreSnapshot, DimensionSnapshot } from "./agent-score-snapshot.ts"

/**
 * How far a dimension may sit from the composite, in score points.
 *
 * Wide enough that the ring reads as five distinct arcs rather than a flat wheel, narrow enough
 * that a demo does not look like it is scoring five unrelated things.
 */
const MAX_DIMENSION_SPREAD = 9

/** Half-width of every published interval, in score points. */
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

/**
 * Dimension scores that scatter around the composite and still average back to it.
 *
 * The offsets are centred against the composite weights and then scaled, so the weighted mean of
 * the result is the requested composite exactly rather than approximately. That matters more than
 * it looks: the ring shows the composite in the middle and the five dimensions around it, and a
 * demo whose middle number disagrees with its own arcs is worse than one with five equal arcs.
 *
 * The scale also shrinks as the composite approaches either end, which is what keeps every
 * dimension inside [0, 100] without a clamp — a clamp would silently break the mean it just fixed.
 */
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
  /** The composite to publish for that date, 0–100. */
  readonly score: number
  readonly scoringVersion: string
  readonly windowDays: number
  readonly eligibleSessionCount: number
  readonly weights: Readonly<Record<ScoreDimension, number>>
  readonly createdAt: Date
}

/**
 * A snapshot built from a composite score instead of measured evidence.
 *
 * Exists for demo projects, which can have every other kind of seeded data and still have no score
 * history, because history only accrues one real day at a time. Staff pick the shape of the curve
 * and this fills in the sixteen other numbers a stored snapshot needs.
 *
 * It carries no explanation. The evidence is the one part that cannot be faked into something a
 * reader could inspect, so the page says "evidence is not available for this date" on these days
 * rather than showing invented causes — the score is a prop, the reasoning would be a lie.
 *
 * Deterministic in the project and date, so re-seeding the same range twice produces the same
 * dimensions rather than a second, differently-shaped history.
 */
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
