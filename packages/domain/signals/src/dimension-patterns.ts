import type { DimensionConditionalRate, IssueDimensionComparison } from "@domain/scores"
import { ISSUE_DIMENSION_MIN_RATE_ELEVATION, ISSUE_DIMENSION_MIN_SUPPORT } from "./constants.ts"

/**
 * A dimension value over-represented among an issue's traces under **reverse**
 * conditioning, carrying its rate-elevation. `rateElevation = conditionalRate −
 * baseRate` (percentage points): how much more a value's traces fall into the
 * issue than traces overall. It is the Patterns sort key, comparable across
 * dimensions because `baseRate` is the same for every dimension of one issue.
 */
export interface DimensionPattern extends DimensionConditionalRate {
  readonly rateElevation: number
}

/**
 * Pure pattern gate over a dimension comparison: keeps the values worth
 * surfacing as "unusual for this issue" and sorts them by rate-elevation (most
 * over-represented first). A value is kept when it has enough trace support to
 * trust its conditional rate (`totalTraces ≥ ISSUE_DIMENSION_MIN_SUPPORT`) and
 * its rate is elevated at least `ISSUE_DIMENSION_MIN_RATE_ELEVATION` above the
 * base rate (so near-baseline values don't pad the list).
 *
 * Returns an empty list when nothing clears the gate — the caller then shows a
 * "not enough data" state rather than near-base-rate noise. The forward-vs-
 * reverse rationale lives in `specs/issue-details-page.md` (Data model #2).
 */
export const rankDimensionValues = (comparison: IssueDimensionComparison): readonly DimensionPattern[] =>
  comparison.values
    .filter((value) => value.totalTraces >= ISSUE_DIMENSION_MIN_SUPPORT)
    .map((value) => ({ ...value, rateElevation: value.conditionalRate - comparison.baseRate }))
    .filter((pattern) => pattern.rateElevation >= ISSUE_DIMENSION_MIN_RATE_ELEVATION)
    .sort((a, b) => b.rateElevation - a.rateElevation)
