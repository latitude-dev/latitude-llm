import { z } from 'zod'
import { SimulationSettingsSchema } from './simulation'

export enum OptimizationEngine {
  Identity = 'identity',
}

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
  iterations: z.number().min(1).max(100).optional(), // TODO(AO/OPT): Remove, only for testing
})
export type OptimizationConfiguration = z.infer<
  typeof OptimizationConfigurationSchema
>

export const OPTIMIZATION_CANCEL_TIMEOUT = 10 * 1000 // 10 seconds

export const OPTIMIZATION_DEFAULT_ERROR = 'Optimization cancelled'
export const OPTIMIZATION_CANCELLED_ERROR = 'Optimization cancelled by user'

export const OPTIMIZATION_DATASET_ROWS = 1000
export const OPTIMIZATION_DATASET_SPLIT = 0.7 // 70% trainset, 30% testset
