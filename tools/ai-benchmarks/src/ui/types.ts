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
  readonly addedFailures: number
  readonly removedFailures: number
  readonly changedFailures: number
  readonly fixtureChanged: boolean
}

export interface InspectableRow {
  readonly row: FixtureRow
  readonly prediction: Prediction
}

export type FlipKind = "added" | "removed" | "changed"

export interface InspectableFlip extends InspectableRow {
  readonly kind: FlipKind
  /**
   * The baseline-side state for this row, when there is one. Absent for
   * `kind: "added"` (the row did not appear in the baseline failure list).
   * Present for `kind: "removed"` (was a baseline failure, now passing) and
   * `kind: "changed"` (still a failure, but predicted/phase shifted).
   */
  readonly previous?: { predicted: boolean; phase: Prediction["phase"] }
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
  readonly flippedRows: readonly InspectableFlip[]
}
