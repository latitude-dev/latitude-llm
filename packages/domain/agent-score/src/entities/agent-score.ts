import type { OrganizationId, ProjectId } from "@domain/shared"
import type { DimensionAttribution } from "../scoring/attribute-dimensions.ts"
import type { WindowCostAggregate, WindowSpeedAggregate } from "../scoring/bootstrap-window.ts"
import type { WindowIssues } from "../scoring/build-window-issues.ts"
import type { AgentScoreComposite, DimensionResult } from "../scoring/compose-agent-score.ts"
import type { ProjectOutcomeEstimate } from "../scoring/estimate-outcome.ts"
import type { ProjectReliabilityEstimate } from "../scoring/estimate-reliability.ts"
import type { ProjectSafetyEstimate } from "../scoring/estimate-safety.ts"
import type { ScoreWindowReason } from "../scoring/select-score-window.ts"
import type { WindowReaderCoverage } from "../scoring/tally-reader-coverage.ts"
import type { CostWindowGate, SpeedWindowGate } from "../scoring/window-gates.ts"

export interface AgentScoreWindow {
  readonly stepDays: number
  readonly from: Date
  readonly to: Date
  readonly reason: ScoreWindowReason
  readonly eligibleSessionCount: number
}

/**
 * Reader-level facts the interval cannot explain by itself.
 *
 * Resolved from the same window as the score and reported beside it. Coverage can make a dimension
 * unmeasured; it can never turn an observed failure into a success, which is why every count here
 * is a denominator or an exclusion and none of them is a score.
 */
export interface AgentScoreCoverage {
  readonly eligibleSessionCount: number
  readonly readSessionCount: number
  readonly outcome: ProjectOutcomeEstimate
  readonly reliability: ProjectReliabilityEstimate
  readonly safety: ProjectSafetyEstimate
  readonly cost: CostWindowGate
  readonly speed: SpeedWindowGate
  /** Per-reader examined share, and the unmapped or missing evidence behind every shortfall. */
  readonly readers: readonly WindowReaderCoverage[]
  /** The artifacts this run loaded, so a snapshot can be traced back to what produced it. */
  readonly artifactVersions: {
    readonly cost: string
    readonly costCatalog: string
    readonly latency: string
  }
  /** Signals whose residual effect could not be estimated. */
  readonly unmeasuredSignalEffects: number
}

export interface AgentScoreNativeInputs {
  readonly cost: WindowCostAggregate
  readonly speed: WindowSpeedAggregate
}

export type AgentScoreStatus = "published" | "withheld"

export interface AgentScoreResult {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** The version every formula, curve, prompt and frozen reference in this run came from. */
  readonly scoringVersion: string
  readonly status: AgentScoreStatus
  /** Absent when the project did not reach the session floor under any step. */
  readonly window?: AgentScoreWindow
  readonly dimensions: readonly DimensionResult[]
  readonly composite?: AgentScoreComposite
  readonly coverage?: AgentScoreCoverage
  readonly native?: AgentScoreNativeInputs
  /**
   * Why the score is what it is, resolved from the live window.
   *
   * Current evidence, not a decomposition of the stored snapshot: new readings can arrive after a
   * snapshot is written, so these rows explain present behaviour and are never presented as the
   * history of a number. Outcome and Safety are absent here and use the smaller issue contract.
   */
  readonly attribution?: readonly DimensionAttribution[]
  /**
   * Where Outcome failures and Safety harm concentrate.
   *
   * The smaller contract: reach and corrected adverse reach, no Shapley share and no fix gain,
   * because these dimensions come from a holistic verdict and a confirmed-harm union rather than
   * from adding up defects.
   */
  readonly issues?: WindowIssues
  /** Why nothing was published: the session floor, or the dimensions that could not be measured. */
  readonly withheldReason?: "sessionFloor" | "unmeasuredDimensions"
}
