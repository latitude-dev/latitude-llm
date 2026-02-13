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
import { DatasetRow } from '../../../schema/models/types/DatasetRow'
import { EngineClient } from '../../engine'
import { OptimizerArgs } from './index'
import { PROMPT_HASH, Trajectory, TRAJECTORY_ID } from './shared'

const componentSchema = z.string() // <doc_path>

const partialPromptSchema = z.string() // <prompt_hash>

const systemSchema = z.record(componentSchema, partialPromptSchema) // { <doc_path>: <prompt_hash> }

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
  prompt: partialPromptSchema,
  context: z.array(partialTrajectorySchema),
})

const gepaProposeResultSchema = z.object({
  prompt: partialPromptSchema,
})

// BONUS(AO/OPT): Implement multi-document optimization
export async function gepaOptimizer(
  {
    evaluate,
    propose,
    trainset,
    valset,
    optimization,
    document,
    abortSignal,
  }: OptimizerArgs<OptimizationEngine.Gepa>,
  _ = database,
) {
  const examples: Record<string, DatasetRow> = {}
  const trajectories: Record<string, Trajectory> = {}
  const prompts: Record<string, string> = {}

  const hash = PROMPT_HASH(optimization.baselinePrompt)
  prompts[hash] = optimization.baselinePrompt
  const baseline = { [document.path]: hash }

  const trainples = []
  for (const row of trainset) {
    const id = TRAJECTORY_ID(row)
    examples[id] = row
    trainples.push({ id })
  }

  const valples = []
  for (const row of valset) {
    const id = TRAJECTORY_ID(row)
    examples[id] = row
    valples.push({ id })
  }

  const engine = new EngineClient(abortSignal)

  engine.on(
    GepaMethod.Evaluate,
    gepaEvaluateParamsSchema,
    gepaEvaluateResultSchema,
    async (params) => {
      const prompt = prompts[params.candidate[document.path]!]!
      const example = examples[params.example.id]!

      const trajectory = await evaluate({
        prompt: prompt,
        example: example,
        abortSignal: abortSignal,
      }).then((r) => r.unwrap())

      trajectories[trajectory.id] = trajectory

      // Note: we just pass a partial trajectory for performance
      // as the algorithm does not inspect or need the full one
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
      const prompt = prompts[params.prompt]!
      const context = params.context
        .map((t) => trajectories[t.id])
        .filter((t) => t !== undefined)

      const proposed = await propose({
        prompt: prompt,
        context: context,
        abortSignal: abortSignal,
      }).then((r) => r.unwrap())

      const hash = PROMPT_HASH(proposed)
      prompts[hash] = proposed

      // Note: we just pass a partial prompt for performance
      // as the algorithm does not inspect or need the full one
      return {
        prompt: hash,
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

    const prompt = prompts[result.optimized[document.path]!] ?? ''

    return Result.ok(prompt)
  } catch (error) {
    return Result.error(error as Error)
  } finally {
    await engine.stop()
  }
}
