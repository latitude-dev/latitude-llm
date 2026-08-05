import { WASTED_SPEND_MIN_SAMPLE_TRACES } from "../ports/cost-analytics-repository.ts"

/**
 * Wasted spend as a share of the window, or null when the window cannot support a share.
 *
 * Null on three counts, all of which would otherwise put a percentage where there is no
 * finding: nothing was spent, so there is no denominator; fewer than
 * `WASTED_SPEND_MIN_SAMPLE_TRACES` traces carried usage, where one failure moves the
 * figure by tens of points; or the errored traces recorded no spend, which is a $0 claim
 * rather than a 0% one. The dollar figure is shown either way — it is a sum, and true at
 * any volume.
 *
 * The gate lives here rather than at the call site so a second reader cannot reintroduce
 * the ungated ratio.
 */
export function wastedSpendShare({
  erroredCostMicrocents,
  totalMicrocents,
  tracesWithUsage,
}: {
  readonly erroredCostMicrocents: number
  readonly totalMicrocents: number
  readonly tracesWithUsage: number
}): number | null {
  if (totalMicrocents <= 0 || erroredCostMicrocents <= 0) return null
  if (tracesWithUsage < WASTED_SPEND_MIN_SAMPLE_TRACES) return null
  return erroredCostMicrocents / totalMicrocents
}
