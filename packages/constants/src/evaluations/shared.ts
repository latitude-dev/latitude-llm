import { z } from 'zod'

export const BaseEvaluationConfiguration = z.object({
  reverseScale: z.boolean(), // If true, lower is better, otherwise, higher is better
})
export const BaseEvaluationResultMetadata = z.object({})
export const BaseEvaluationResultError = z.object({
  message: z.string(),
})
