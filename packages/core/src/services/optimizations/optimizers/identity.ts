import { database } from '../../../client'
import { OptimizationEngine } from '../../../constants'
import { Result } from '../../../lib/Result'
import { OptimizerArgs } from './index'

export async function identityOptimizer(
  { optimization }: OptimizerArgs<OptimizationEngine.Identity>,
  _ = database,
) {
  const result = optimization.baselinePrompt

  return Result.ok(result)
}
