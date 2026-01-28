import { z } from 'zod'
import { SimulationSettingsSchema } from './simulation'

export enum OptimizationEngine {
  Identity = 'identity',
  Gepa = 'gepa',
}

export const OPTIMIZATION_SCORE_SCALE = 1 // Note: most algorithms use floats with a scale of [0,1]

export const OPTIMIZATION_MAX_TIME = 2 * 60 * 60 // 2 hours
export const OPTIMIZATION_MAX_TOKENS = 100_000_000 // 100M tokens

export const OPTIMIZATION_CANCEL_TIMEOUT = 10 * 1000 // 10 seconds

export const OPTIMIZATION_DEFAULT_ERROR = 'Optimization cancelled'
export const OPTIMIZATION_CANCELLED_ERROR = 'Optimization cancelled by user'

export const OPTIMIZATION_MIN_ROWS = 4
export const OPTIMIZATION_TARGET_ROWS = 250 // Note: algorithms need a sufficient amount of data to generalize and converge to avoid noise and bias
export const OPTIMIZATION_MAX_ROWS = 1000

export const OPTIMIZATION_MIN_TARGET_ROWS = 50
export const OPTIMIZATION_MAX_TARGET_ROWS = 500
export const OPTIMIZATION_TARGET_ROWS_STEP = 50
export const OPTIMIZATION_TARGET_ROWS_PRESETS = {
  small: { value: 100, label: 'Small', description: 'Faster curation, fewer examples' },
  standard: { value: 250, label: 'Standard', description: 'Balanced quality and speed' },
  large: { value: 500, label: 'Large', description: 'More examples, better coverage' },
} as const

export const OPTIMIZATION_TESTSET_SPLIT = 0.7 // 70% trainset, 30% testset
export const OPTIMIZATION_VALSET_SPLIT = 0.5 // 50% testset, 50% valset

export const OptimizationBudgetSchema = z.object({
  time: z.number().min(0).optional(),
  tokens: z.number().min(0).optional(),
})
export type OptimizationBudget = z.infer<typeof OptimizationBudgetSchema>

export const OptimizationConfigurationSchema = z.object({
  parameters: z
    .record(
      z.string(),
      z.object({
        column: z.string().optional(), // Note: corresponding column in the user-provided trainset and testset
        isPii: z.boolean().optional(),
      }),
    )
    .optional(),
  simulation: SimulationSettingsSchema.optional(),
  scope: z
    .object({
      configuration: z.boolean().optional(),
      instructions: z.boolean().optional(),
    })
    .optional(),
  budget: OptimizationBudgetSchema.optional(),
  targetRows: z
    .number()
    .min(OPTIMIZATION_MIN_TARGET_ROWS)
    .max(OPTIMIZATION_MAX_TARGET_ROWS)
    .optional(),
})
export type OptimizationConfiguration = z.infer<
  typeof OptimizationConfigurationSchema
>
