import { Database } from '../../../client'
import { EvaluationV2, OptimizationEngine } from '../../../constants'
import { TypedResult } from '../../../lib/Result'
import { Commit } from '../../../schema/models/types/Commit'
import { Dataset } from '../../../schema/models/types/Dataset'
import { DatasetRow } from '../../../schema/models/types/DatasetRow'
import { DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { Optimization } from '../../../schema/models/types/Optimization'
import { Workspace } from '../../../schema/models/types/Workspace'
import { gepaOptimizer } from './gepa'
import { identityOptimizer } from './identity'
import { Trajectory } from './shared'

export { evaluateFactory } from './evaluate'
export { proposeFactory } from './propose'

export type OptimizerEvaluateArgs = {
  prompt: string
  example: DatasetRow
  abortSignal?: AbortSignal
}

export type OptimizerProposeArgs = {
  prompt: string
  context: Trajectory[]
  abortSignal?: AbortSignal
}

export type OptimizerArgs<_E extends OptimizationEngine> = {
  evaluate: (
    args: OptimizerEvaluateArgs,
    db?: Database,
  ) => Promise<TypedResult<Trajectory>>
  propose: (
    args: OptimizerProposeArgs,
    db?: Database,
  ) => Promise<TypedResult<string>>
  evaluation: EvaluationV2
  trainset: Dataset
  valset: Dataset
  optimization: Optimization
  document: DocumentVersion
  commit: Commit
  workspace: Workspace
  abortSignal?: AbortSignal
}

export type Optimizer<T extends OptimizationEngine> = (
  args: OptimizerArgs<T>,
  db?: Database,
) => Promise<TypedResult<string>>

// prettier-ignore
export const OPTIMIZATION_ENGINES: {
  [T in OptimizationEngine]: Optimizer<T>
} = {
  [OptimizationEngine.Identity]: identityOptimizer,
  [OptimizationEngine.Gepa]: gepaOptimizer,
}
