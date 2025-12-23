import { Database } from '../../../client'
import {
  EvaluationResultV2,
  EvaluationV2,
  OptimizationEngine,
} from '../../../constants'
import { TypedResult } from '../../../lib/Result'
import { Dataset } from '../../../schema/models/types/Dataset'
import { DatasetRow } from '../../../schema/models/types/DatasetRow'
import { Optimization } from '../../../schema/models/types/Optimization'
import { Workspace } from '../../../schema/models/types/Workspace'
import { identityOptimizer } from './identity'

export type OptimizerEvaluateArgs = {
  prompt: string
  example: DatasetRow
  evaluation: EvaluationV2
  optimization: Optimization
  workspace: Workspace
  abortSignal?: AbortSignal
}

export type OptimizerArgs<_ extends OptimizationEngine> = {
  evaluate: (
    args: OptimizerEvaluateArgs,
    db?: Database,
  ) => Promise<TypedResult<EvaluationResultV2>>
  evaluation: EvaluationV2
  dataset: Dataset
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
}
