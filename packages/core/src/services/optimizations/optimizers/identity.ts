import { database } from '../../../client'
import { OptimizationEngine } from '../../../constants'
import { Result } from '../../../lib/Result'
import { OptimizerArgs } from './index'

export async function identityOptimizer(
  { optimization }: OptimizerArgs<OptimizationEngine.Identity>,
  _ = database,
) {
  const result = optimization.baselinePrompt

  // TODO(AO/OPT): Remove, only for testing
  await new Promise((resolve) => setTimeout(resolve, 10000))

  return Result.ok(result)
}
