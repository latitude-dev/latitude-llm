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

export const EVALUATION_TRIGGER_TARGETS = ['first', 'every', 'last'] as const
export type EvaluationTriggerTarget =
  (typeof EVALUATION_TRIGGER_TARGETS)[number]

export const DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS = 120
export const LAST_INTERACTION_DEBOUNCE_MIN_SECONDS = 30
export const LAST_INTERACTION_DEBOUNCE_MAX_SECONDS = 60 * 60 * 24 // 1 day

export const DEFAULT_EVALUATION_SAMPLE_RATE = 100
export const MIN_EVALUATION_SAMPLE_RATE = 1
export const MAX_EVALUATION_SAMPLE_RATE = 100

const triggerConfiguration = z.object({
  target: z.enum(EVALUATION_TRIGGER_TARGETS),
  lastInteractionDebounce: z
    .number()
    .min(LAST_INTERACTION_DEBOUNCE_MIN_SECONDS)
    .max(LAST_INTERACTION_DEBOUNCE_MAX_SECONDS)
    .optional(),
  sampleRate: z
    .number()
    .int()
    .min(MIN_EVALUATION_SAMPLE_RATE)
    .max(MAX_EVALUATION_SAMPLE_RATE)
    .optional(),
})
export type TriggerConfiguration = z.infer<typeof triggerConfiguration>

export const baseEvaluationConfiguration = z.object({
  reverseScale: z.boolean(), // If true, lower is better, otherwise, higher is better
  actualOutput: actualOutputConfiguration,
  expectedOutput: expectedOutputConfiguration.optional(),
  trigger: triggerConfiguration.optional(),
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
