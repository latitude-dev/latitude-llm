import { z } from 'zod'

export const BaseEvaluationConfiguration = z.object({
  reverseScale: z.boolean(), // If true, lower is better, otherwise, higher is better
})
export const BaseEvaluationResultMetadata = z.object({
  // Configuration snapshot is defined in every metric specification
  actualOutput: z.string(),
  expectedOutput: z.string().optional(),
  datasetLabel: z.string().optional(),
})
export const BaseEvaluationResultError = z.object({
  message: z.string(),
})
