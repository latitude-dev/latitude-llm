import type { TokenUsageTotals } from "../runner/meter.ts"
import type { Metrics, Prediction } from "../runner/metrics.ts"
import type { FixtureRow } from "../types.ts"

export interface CostSnapshot {
  readonly totalUsd: number | "unknown"
  readonly provider: string
  readonly modelId: string
  readonly usage: TokenUsageTotals
}

export interface BaselineSnapshot {
  readonly present: boolean
  readonly flips: number
  readonly newInCurrent: number
  readonly missingFromCurrent: number
}

export interface InspectableRow {
  readonly row: FixtureRow
  readonly prediction: Prediction
}

/**
 * Everything the ink report needs to render a single-target run. Built by
 * the orchestrator after classification completes; consumed by `<Report>`.
 */
export interface ReportData {
  readonly targetId: string
  readonly sampled: boolean
  readonly sampleSize: number | undefined
  readonly totalRows: number
  readonly metrics: Metrics
  readonly perTactic: Record<string, Metrics>
  readonly perPhase: Record<Prediction["phase"], number>
  readonly cost: CostSnapshot
  readonly baseline: BaselineSnapshot
  readonly failedRows: readonly InspectableRow[]
  readonly flippedRows: readonly InspectableRow[]
}
