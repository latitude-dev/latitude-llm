/**
 * Fixed-width distribution summaries for the garden-run telemetry: a bounded
 * three-number record instead of the raw per-split arrays the adaptive builder
 * collects, so a run's diagnostics stay safe to log and to carry as span tags.
 */

import { quantile } from "./clustering.ts"

export interface BoundedPercentiles {
  readonly p10: number
  readonly p50: number
  readonly p90: number
}

export const boundedPercentiles = (values: readonly number[]): BoundedPercentiles => ({
  p10: quantile(values, 0.1),
  p50: quantile(values, 0.5),
  p90: quantile(values, 0.9),
})
