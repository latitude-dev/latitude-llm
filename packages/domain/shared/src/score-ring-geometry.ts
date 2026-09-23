/**
 * Geometry for the Agent Score ring.
 *
 * Shared because the ring is drawn twice from the same numbers: as SVG on the score page, and as a
 * server-rendered PNG for the weekly digest's email and Slack message. Two implementations of the
 * same arc maths would drift, and the whole point of the digest carrying a ring is that it is the
 * ring the reader already knows.
 */

/** Fraction of each dimension's arc spent on the gap that separates it from its neighbour. */
export const DIMENSION_SEGMENT_GAP_RATIO = 0.04

export interface RingDimension<Id extends string = string> {
  readonly id: Id
  readonly weight: number
  readonly score: number | null
}

export interface WeightedRingSegment<Id extends string = string> extends RingDimension<Id> {
  readonly start: number
  readonly length: number
}

/**
 * Lays the dimensions around a ring of `ringLength`, each taking a share of the circumference
 * proportional to its composite weight, with a gap carved out of its own slot so the segments read
 * as separate arcs rather than one continuous ring.
 */
export const buildWeightedRingSegments = <Id extends string>(
  dimensions: readonly RingDimension<Id>[],
  ringLength: number,
  gapRatio = DIMENSION_SEGMENT_GAP_RATIO,
): WeightedRingSegment<Id>[] => {
  const weights = dimensions.map((dimension) => (Number.isFinite(dimension.weight) ? Math.max(0, dimension.weight) : 0))
  const totalWeight = weights.reduce((total, weight) => total + weight, 0)
  const normalizedWeights = totalWeight > 0 ? weights.map((weight) => weight / totalWeight) : weights.map(() => 0)
  const gapLength = ringLength * Math.max(0, gapRatio)
  let cursor = 0

  return dimensions.map((dimension, index) => {
    const slotLength = ringLength * (normalizedWeights[index] ?? 0)
    const segmentGap = Math.min(gapLength, slotLength)
    const segment = {
      ...dimension,
      start: cursor + segmentGap / 2,
      length: Math.max(0, slotLength - segmentGap),
    }
    cursor += slotLength
    return segment
  })
}

export const clampScore = (score: number): number => Math.max(0, Math.min(100, score))
