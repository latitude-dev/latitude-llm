import { z } from 'zod'

const actualOutputConfiguration = z.object({
  messageSelection: z.enum(['last', 'all']), // Which assistant messages to select
  contentFilter: z
    .enum(['text', 'reasoning', 'image', 'file', 'tool_call'])
    .optional(),
  parsingFormat: z.enum(['string', 'json']),
  fieldAccessor: z.string().optional(), // Field accessor to get the output from if it's a key-value format
})
export type ActualOutputConfiguration = z.infer<
  typeof actualOutputConfiguration
>

const expectedOutputConfiguration = z.object({
  parsingFormat: z.enum(['string', 'json']),
  fieldAccessor: z.string().optional(), // Field accessor to get the output from if it's a key-value format
})
export type ExpectedOutputConfiguration = z.infer<
  typeof expectedOutputConfiguration
>

export const ACCESSIBLE_OUTPUT_FORMATS = ['json']

export const baseEvaluationConfiguration = z.object({
  reverseScale: z.boolean(), // If true, lower is better, otherwise, higher is better
  actualOutput: actualOutputConfiguration,
  expectedOutput: expectedOutputConfiguration.optional(),
})
export const baseEvaluationResultMetadata = z.object({
  // configuration: Configuration snapshot is defined in every metric specification
  actualOutput: z.string(),
  expectedOutput: z.string().optional(),
  datasetLabel: z.string().optional(),
})
export const baseEvaluationResultError = z.object({
  message: z.string(),
})
