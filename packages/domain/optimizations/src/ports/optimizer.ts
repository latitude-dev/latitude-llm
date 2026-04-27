import { type Effect, Context } from "effect"
import type {
  OptimizationBudget,
  OptimizationCandidate,
  OptimizationDatasetSplit,
  OptimizationEvaluationResult,
  OptimizationExample,
  OptimizationResult,
  OptimizationTrajectory,
} from "../entities/optimization.ts"
import type {
  OptimizationAbortedError,
  OptimizationError,
  OptimizationProtocolError,
  OptimizationTransportError,
} from "../errors.ts"

export interface OptimizeEvaluationInput {
  readonly candidate: OptimizationCandidate
  readonly example: OptimizationExample
  readonly abortSignal?: AbortSignal
}

export interface OptimizeProposalInput {
  readonly candidate: OptimizationCandidate
  readonly context: readonly OptimizationTrajectory[]
  readonly abortSignal?: AbortSignal
}

export interface OptimizeCandidateInput {
  readonly baselineCandidate: OptimizationCandidate
  readonly dataset: OptimizationDatasetSplit
  readonly budget?: OptimizationBudget
  /**
   * Number of failure trajectories sampled per reflection round (passed
   * through to GEPA's `reflection_minibatch_size`). Higher values give the
   * proposer broader context per iteration at the cost of more input
   * tokens; lower values run faster but see less of the failure surface.
   * Defaults to `GEPA_DEFAULT_REFLECTION_SIZE` when omitted.
   */
  readonly reflectionSize?: number
  readonly evaluate: (input: OptimizeEvaluationInput) => Promise<OptimizationEvaluationResult>
  readonly propose: (input: OptimizeProposalInput) => Promise<OptimizationCandidate>
  readonly abortSignal?: AbortSignal
}

export type OptimizerError =
  | OptimizationAbortedError
  | OptimizationError
  | OptimizationProtocolError
  | OptimizationTransportError

export interface OptimizerShape {
  optimize(input: OptimizeCandidateInput): Effect.Effect<OptimizationResult, OptimizerError>
}

export class Optimizer extends Context.Service<Optimizer, OptimizerShape>()("@domain/optimizations/Optimizer") {}
