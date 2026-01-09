import { database } from '../../../client'
import { OptimizationEngine } from '../../../constants'
import { Result } from '../../../lib/Result'
import { OptimizerArgs } from './index'

export async function gepaOptimizer(
  { optimization }: OptimizerArgs<OptimizationEngine.Gepa>,
  _ = database,
) {
  const result = optimization.baselinePrompt

  return Result.ok(result)
}
