import { Message } from 'promptl-ai'
import { Database } from '../../../client'
import { EvaluationV2, OptimizationEngine } from '../../../constants'
import { TypedResult } from '../../../lib/Result'
import { Dataset } from '../../../schema/models/types/Dataset'
import { DatasetRow } from '../../../schema/models/types/DatasetRow'
import { Optimization } from '../../../schema/models/types/Optimization'
import { Workspace } from '../../../schema/models/types/Workspace'
import { gepaOptimizer } from './gepa'
import { identityOptimizer } from './identity'

export type OptimizerEvaluateArgs = {
  prompt: string
  example: DatasetRow
  abortSignal?: AbortSignal
}

export type OptimizerEvaluateResult = {
  trace: Message[]
  result: {
    score: number // Normalized score
    reason: string
    passed: boolean
  }
}

export type OptimizerArgs<_E extends OptimizationEngine> = {
  evaluate: (
    args: OptimizerEvaluateArgs,
    db?: Database,
  ) => Promise<TypedResult<OptimizerEvaluateResult>>
  evaluation: EvaluationV2
  trainset: Dataset
  valset: Dataset
  optimization: Optimization
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
