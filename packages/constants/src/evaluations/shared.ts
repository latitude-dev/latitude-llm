import { z } from 'zod'

export const BaseEvaluationConfiguration = z.object({
  reverseScale: z.boolean(), // If true, lower is better, otherwise, higher is better
  outputFormat: z.enum(['string', 'json']).default('string'), // The format actual and expected outputs will be parsed into
  outputField: z.string().optional(), // The field to get the output from if it's a key-value format
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
