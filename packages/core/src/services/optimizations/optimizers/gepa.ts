import { z } from 'zod'
import { database } from '../../../client'
import {
  languageModelUsageSchema,
  OPTIMIZATION_MAX_TIME,
  OPTIMIZATION_MAX_TOKENS,
  OptimizationBudgetSchema,
  OptimizationEngine,
} from '../../../constants'
import { Result } from '../../../lib/Result'
import { DatasetRowsRepository } from '../../../repositories'
import { DatasetRow } from '../../../schema/models/types/DatasetRow'
import { EngineClient } from '../../engine'
import { OptimizerArgs } from './index'
import { Trajectory, TRAJECTORY_ID } from './shared'

const componentSchema = z.string() // <doc_path>

const systemSchema = z.record(componentSchema, z.string()) // { <doc_path>: <prompt> }

const partialExampleSchema = z.object({
  id: z.string(), // <workspace_id>::<dataset_id>::<row_id>
})

const partialTrajectorySchema = z.object({
  id: z.string(), // <workspace_id>::<dataset_id>::<row_id>
})

const partialOutputSchema = z.object({
  id: z.string(), // <workspace_id>::<dataset_id>::<row_id>
  usage: languageModelUsageSchema,
  duration: z.number(),
  score: z.number(), // Normalized score [0,1]
})

enum GepaMethod {
  Optimize = 'gepa_optimize',
  Evaluate = 'gepa_evaluate',
  Propose = 'gepa_propose',
}

const gepaOptimizeParamsSchema = z.object({
  baseline: systemSchema,
  trainset: z.array(partialExampleSchema),
  valset: z.array(partialExampleSchema),
  budget: OptimizationBudgetSchema,
})

const gepaOptimizeResultSchema = z.object({
  optimized: systemSchema,
})

const gepaEvaluateParamsSchema = z.object({
  candidate: systemSchema,
  example: partialExampleSchema,
})

const gepaEvaluateResultSchema = partialOutputSchema

const gepaProposeParamsSchema = z.object({
  component: componentSchema,
  prompt: z.string(),
  context: z.array(partialTrajectorySchema),
})

const gepaProposeResultSchema = z.object({
  prompt: z.string(),
})

type Cache = Record<string, { example: DatasetRow; trajectory?: Trajectory }>

// BONUS(AO/OPT): Implement multi-document optimization
// BONUS(AO/OPT): Do not pass the full system but a partial one with ids for performance
export async function gepaOptimizer(
  {
    evaluate,
    propose,
    trainset,
    valset,
    optimization,
    document,
    workspace,
    abortSignal,
  }: OptimizerArgs<OptimizationEngine.Gepa>,
  db = database,
) {
  const cache: Cache = {}

  const baseline = { [document.path]: optimization.baselinePrompt }

  const rowsRepository = new DatasetRowsRepository(workspace.id, db)

  // BONUS(AO/OPT): Maybe we should just get the ids and then get the row on demand?
  const trainrows = await rowsRepository.findAllByDataset(trainset.id)
  const trainples = []
  for (const row of trainrows) {
    const id = TRAJECTORY_ID(row)
    cache[id] = { example: row }
    trainples.push({ id })
  }

  // BONUS(AO/OPT): Maybe we should just get the ids and then get the row on demand?
  const valrows = await rowsRepository.findAllByDataset(valset.id)
  const valples = []
  for (const row of valrows) {
    const id = TRAJECTORY_ID(row)
    cache[id] = { example: row }
    valples.push({ id })
  }

  const engine = new EngineClient(abortSignal)

  engine.on(
    GepaMethod.Evaluate,
    gepaEvaluateParamsSchema,
    gepaEvaluateResultSchema,
    async (params) => {
      const prompt = params.candidate[document.path]
      const example = cache[params.example.id]!.example

      const trajectory = await evaluate({
        prompt: prompt,
        example: example,
        abortSignal: abortSignal,
      }).then((r) => r.unwrap())

      cache[params.example.id]!.trajectory = trajectory

      // Note: we just pass a partial trajectory for performance
      // as the algorithm does not need the full one
      return {
        id: trajectory.id,
        usage: trajectory.usage,
        duration: trajectory.duration,
        score: trajectory.score,
      }
    },
  )

  engine.on(
    GepaMethod.Propose,
    gepaProposeParamsSchema,
    gepaProposeResultSchema,
    async (params) => {
      const context = params.context
        .map((t) => cache[t.id]!.trajectory)
        .filter((t) => t !== undefined)

      const prompt = await propose({
        prompt: params.prompt,
        context: context,
        abortSignal: abortSignal,
      }).then((r) => r.unwrap())

      return {
        prompt: prompt,
      }
    },
  )

  try {
    await engine.start()

    const result = await engine.call(
      GepaMethod.Optimize,
      gepaOptimizeParamsSchema,
      {
        baseline: baseline,
        trainset: trainples,
        valset: valples,
        budget: optimization.configuration.budget ?? {
          time: OPTIMIZATION_MAX_TIME,
          tokens: OPTIMIZATION_MAX_TOKENS,
        },
      },
      gepaOptimizeResultSchema,
    )

    const prompt = result.optimized[document.path] ?? ''

    return Result.ok(prompt)
  } catch (error) {
    return Result.error(error as Error)
  } finally {
    await engine.stop()
  }
}
