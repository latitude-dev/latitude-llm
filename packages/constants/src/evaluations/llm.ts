import { z } from 'zod'
import {
  BaseEvaluationConfiguration,
  BaseEvaluationResultError,
  BaseEvaluationResultMetadata,
} from './shared'

const llmEvaluationConfiguration = BaseEvaluationConfiguration.extend({
  provider: z.string(),
  model: z.string(),
})
const llmEvaluationResultMetadata = BaseEvaluationResultMetadata.extend({
  evaluationLogId: z.number(),
  reason: z.string(),
  tokens: z.number(),
  cost: z.number(),
  duration: z.number(),
})
const llmEvaluationResultError = BaseEvaluationResultError.extend({
  runErrorId: z.number().optional(),
})

// BINARY

const llmEvaluationBinaryConfiguration = llmEvaluationConfiguration.extend({
  criteria: z.string(),
  passDescription: z.string(),
  failDescription: z.string(),
})
const llmEvaluationBinaryResultMetadata = llmEvaluationResultMetadata.extend({
  configuration: llmEvaluationBinaryConfiguration,
})
const llmEvaluationBinaryResultError = llmEvaluationResultError.extend({})
export const LlmEvaluationBinarySpecification = {
  name: 'Binary',
  description:
    'Judges whether the response meets the criteria. The resulting score is "passed" or "failed"',
  configuration: llmEvaluationBinaryConfiguration,
  resultMetadata: llmEvaluationBinaryResultMetadata,
  resultError: llmEvaluationBinaryResultError,
  requiresExpectedOutput: false,
  supportsLiveEvaluation: true,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
} as const
export type LlmEvaluationBinaryConfiguration = z.infer<
  typeof LlmEvaluationBinarySpecification.configuration
>
export type LlmEvaluationBinaryResultMetadata = z.infer<
  typeof LlmEvaluationBinarySpecification.resultMetadata
>
export type LlmEvaluationBinaryResultError = z.infer<
  typeof LlmEvaluationBinarySpecification.resultError
>

// RATING

const llmEvaluationRatingConfiguration = llmEvaluationConfiguration.extend({
  criteria: z.string(),
  minRating: z.number(),
  minRatingDescription: z.string(),
  maxRating: z.number(),
  maxRatingDescription: z.string(),
  minThreshold: z.number().optional(), // Threshold in rating range
  maxThreshold: z.number().optional(), // Threshold in rating range
})
const llmEvaluationRatingResultMetadata = llmEvaluationResultMetadata.extend({
  configuration: llmEvaluationRatingConfiguration,
})
const llmEvaluationRatingResultError = llmEvaluationResultError.extend({})
export const LlmEvaluationRatingSpecification = {
  name: 'Rating',
  description:
    'Judges the response by rating it under a criteria. The resulting score is the rating',
  configuration: llmEvaluationRatingConfiguration,
  resultMetadata: llmEvaluationRatingResultMetadata,
  resultError: llmEvaluationRatingResultError,
  requiresExpectedOutput: false,
  supportsLiveEvaluation: true,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
} as const
export type LlmEvaluationRatingConfiguration = z.infer<
  typeof LlmEvaluationRatingSpecification.configuration
>
export type LlmEvaluationRatingResultMetadata = z.infer<
  typeof LlmEvaluationRatingSpecification.resultMetadata
>
export type LlmEvaluationRatingResultError = z.infer<
  typeof LlmEvaluationRatingSpecification.resultError
>

// COMPARISON

const llmEvaluationComparisonConfiguration = llmEvaluationConfiguration.extend({
  criteria: z.string(),
  passDescription: z.string(),
  failDescription: z.string(),
  minThreshold: z.number().optional(), // Threshold percentage
  maxThreshold: z.number().optional(), // Threshold percentage
})
const llmEvaluationComparisonResultMetadata =
  llmEvaluationResultMetadata.extend({
    configuration: llmEvaluationComparisonConfiguration,
  })
const llmEvaluationComparisonResultError = llmEvaluationResultError.extend({})
export const LlmEvaluationComparisonSpecification = {
  name: 'Comparison',
  description:
    'Judges the response by comparing the criteria to the expected output. The resulting score is the percentage of compared criteria that is met',
  configuration: llmEvaluationComparisonConfiguration,
  resultMetadata: llmEvaluationComparisonResultMetadata,
  resultError: llmEvaluationComparisonResultError,
  requiresExpectedOutput: true,
  supportsLiveEvaluation: false,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
} as const
export type LlmEvaluationComparisonConfiguration = z.infer<
  typeof LlmEvaluationComparisonSpecification.configuration
>
export type LlmEvaluationComparisonResultMetadata = z.infer<
  typeof LlmEvaluationComparisonSpecification.resultMetadata
>
export type LlmEvaluationComparisonResultError = z.infer<
  typeof LlmEvaluationComparisonSpecification.resultError
>

// CUSTOM

const llmEvaluationCustomConfiguration = llmEvaluationConfiguration.extend({
  prompt: z.string(),
  minScore: z.number(),
  maxScore: z.number(),
  minThreshold: z.number().optional(), // Threshold percentage
  maxThreshold: z.number().optional(), // Threshold percentage
})
const llmEvaluationCustomResultMetadata = llmEvaluationResultMetadata.extend({
  configuration: llmEvaluationCustomConfiguration,
})
const llmEvaluationCustomResultError = llmEvaluationResultError.extend({})
export const LlmEvaluationCustomSpecification = {
  name: 'Custom',
  description:
    'Judges the response under a criteria using a custom prompt. The resulting score is the value of criteria that is met',
  configuration: llmEvaluationCustomConfiguration,
  resultMetadata: llmEvaluationCustomResultMetadata,
  resultError: llmEvaluationCustomResultError,
  requiresExpectedOutput: false,
  supportsLiveEvaluation: true,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
} as const
export type LlmEvaluationCustomConfiguration = z.infer<
  typeof LlmEvaluationCustomSpecification.configuration
>
export type LlmEvaluationCustomResultMetadata = z.infer<
  typeof LlmEvaluationCustomSpecification.resultMetadata
>
export type LlmEvaluationCustomResultError = z.infer<
  typeof LlmEvaluationCustomSpecification.resultError
>

export const LLM_EVALUATION_CUSTOM_PROMPT_DOCUMENTATION = `
/*
  IMPORTANT: The evaluation MUST return an object with the score and reason fields.

  These are the available variables:
  - {{ actualOutput }} (string): The actual output to evaluate
  - {{ expectedOutput }} (string/undefined): The, optional, expected output to compare against
  - {{ conversation }} (string): The full conversation of the evaluated log

  - {{ messages }} (array of objects): All the messages of the conversation
  - {{ toolCalls }} (array of objects): All the tool calls of the conversation
  - {{ cost }} (number): The cost, in cents, of the evaluated log
  - {{ tokens }} (number): The tokens of the evaluated log
  - {{ duration }} (number): The duration, in seconds, of the evaluated log

  More info on messages and tool calls format in: https://docs.latitude.so/promptl/syntax/messages

  - {{ prompt }} (string): The prompt of the evaluated log
  - {{ config }} (object): The configuration of the evaluated log
  - {{ parameters }} (object): The parameters of the evaluated log

  More info on configuration and parameters format in: https://docs.latitude.so/promptl/syntax/configuration
*/
`.trim()

// CUSTOM LABELED

export const LlmEvaluationCustomLabeledSpecification = {
  ...LlmEvaluationCustomSpecification,
  name: 'Custom (Labeled)',
  requiresExpectedOutput: true,
  supportsLiveEvaluation: false,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
} as const

/* ------------------------------------------------------------------------- */

export enum LlmEvaluationMetric {
  Binary = 'binary',
  Rating = 'rating',
  Comparison = 'comparison',
  Custom = 'custom',
  CustomLabeled = 'custom_labeled',
}

export type LlmEvaluationMetricAnyCustom =
  | LlmEvaluationMetric.Custom
  | LlmEvaluationMetric.CustomLabeled

// prettier-ignore
export type LlmEvaluationConfiguration<M extends LlmEvaluationMetric = LlmEvaluationMetric> =
  M extends LlmEvaluationMetric.Binary ? LlmEvaluationBinaryConfiguration :
  M extends LlmEvaluationMetric.Rating ? LlmEvaluationRatingConfiguration :
  M extends LlmEvaluationMetric.Comparison ? LlmEvaluationComparisonConfiguration :
  M extends LlmEvaluationMetric.Custom ? LlmEvaluationCustomConfiguration :
  M extends LlmEvaluationMetric.CustomLabeled ? LlmEvaluationCustomConfiguration :
  never;

// prettier-ignore
export type LlmEvaluationResultMetadata<M extends LlmEvaluationMetric = LlmEvaluationMetric> =
  M extends LlmEvaluationMetric.Binary ? LlmEvaluationBinaryResultMetadata :
  M extends LlmEvaluationMetric.Rating ? LlmEvaluationRatingResultMetadata :
  M extends LlmEvaluationMetric.Comparison ? LlmEvaluationComparisonResultMetadata :
  M extends LlmEvaluationMetric.Custom ? LlmEvaluationCustomResultMetadata :
  M extends LlmEvaluationMetric.CustomLabeled ? LlmEvaluationCustomResultMetadata :
  never;

// prettier-ignore
export type LlmEvaluationResultError<M extends LlmEvaluationMetric = LlmEvaluationMetric> =
  M extends LlmEvaluationMetric.Binary ? LlmEvaluationBinaryResultError :
  M extends LlmEvaluationMetric.Rating ? LlmEvaluationRatingResultError :
  M extends LlmEvaluationMetric.Comparison ? LlmEvaluationComparisonResultError :
  M extends LlmEvaluationMetric.Custom ? LlmEvaluationCustomResultError :
  M extends LlmEvaluationMetric.CustomLabeled ? LlmEvaluationCustomResultError :
  never;

export const LlmEvaluationSpecification = {
  name: 'LLM-as-a-Judge',
  description: 'Evaluate responses using an LLM as a judge',
  configuration: llmEvaluationConfiguration,
  resultMetadata: llmEvaluationResultMetadata,
  resultError: llmEvaluationResultError,
  // prettier-ignore
  metrics: {
    [LlmEvaluationMetric.Binary]: LlmEvaluationBinarySpecification,
    [LlmEvaluationMetric.Rating]: LlmEvaluationRatingSpecification,
    [LlmEvaluationMetric.Comparison]: LlmEvaluationComparisonSpecification,
    [LlmEvaluationMetric.Custom]: LlmEvaluationCustomSpecification,
    [LlmEvaluationMetric.CustomLabeled]: LlmEvaluationCustomLabeledSpecification,
  },
} as const

export const LLM_EVALUATION_PROMPT_PARAMETERS = [
  'actualOutput',
  'expectedOutput',
  'conversation',
  'cost',
  'tokens',
  'duration',
  'config',
  'toolCalls',
  'messages',
  'prompt',
  'parameters',
  'context',
  'response',
] as const

export type LlmEvaluationPromptParameter =
  (typeof LLM_EVALUATION_PROMPT_PARAMETERS)[number]
