import { z } from 'zod'

export const BaseEvaluationConfiguration = z.object({})
export const BaseEvaluationResultMetadata = z.object({})
export const BaseEvaluationResultError = z.object({
  message: z.string(),
})
