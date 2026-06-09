import type { IssueDimensionDistribution } from "@domain/scores"
import {
  ISSUE_DIMENSION_BASELINE_FLOOR,
  ISSUE_DIMENSION_MIN_SAMPLE,
  ISSUE_DIMENSION_MIN_VALUE_COUNT,
  ISSUE_DIMENSION_OUTLIER_MIN_LIFT,
} from "./constants.ts"

/**
 * A dimension value that is over-represented among an issue's occurrences
 * relative to the project baseline.
 */
export interface DimensionOutlier {
  readonly value: string
  readonly issuePercent: number
  readonly baselinePercent: number
  /** `issuePercent / max(baselinePercent, floor)` — always finite and ≥ 1 for an outlier. */
  readonly lift: number
}

/**
 * Pure significance gate over a dimension distribution: returns the values that
 * are statistically worth surfacing as "unusual for this issue", sorted by lift
 * (most over-represented first). Returns an empty list when the issue sample is
 * too small to draw a comparison — the caller should then show a low-data state
 * rather than raw lifts.
 *
 * Thresholds are the named `ISSUE_DIMENSION_*` constants so the gate stays
 * consistent across callers.
 */
export const computeDimensionOutliers = (distribution: IssueDimensionDistribution): readonly DimensionOutlier[] => {
  if (distribution.sampleSize < ISSUE_DIMENSION_MIN_SAMPLE) {
    return []
  }

  const baselinePercentByValue = new Map(distribution.baseline.map((entry) => [entry.value, entry.percent] as const))

  return distribution.issue
    .filter((entry) => entry.count >= ISSUE_DIMENSION_MIN_VALUE_COUNT)
    .map((entry) => {
      const baselinePercent = baselinePercentByValue.get(entry.value) ?? 0
      const lift = entry.percent / Math.max(baselinePercent, ISSUE_DIMENSION_BASELINE_FLOOR)
      return { value: entry.value, issuePercent: entry.percent, baselinePercent, lift }
    })
    .filter((outlier) => outlier.lift >= ISSUE_DIMENSION_OUTLIER_MIN_LIFT)
    .sort((a, b) => b.lift - a.lift)
}
