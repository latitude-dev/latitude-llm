import { z } from 'zod'
import {
  BaseEvaluationConfiguration,
  BaseEvaluationResultError,
  BaseEvaluationResultMetadata,
} from './shared'

const llmEvaluationConfiguration = BaseEvaluationConfiguration.extend({
  provider: z.string(),
  model: z.string(),
  instructions: z.string(),
})
const llmEvaluationResultMetadata = BaseEvaluationResultMetadata.extend({
  evaluationLogId: z.number(),
  reason: z.string(),
  tokens: z.number(),
  cost: z.number(),
})
const llmEvaluationResultError = BaseEvaluationResultError.extend({
  runErrorId: z.number(),
})

// BINARY

const llmEvaluationBinaryConfiguration = llmEvaluationConfiguration.extend({
  passDescription: z.string(),
  failDescription: z.string(),
})
const llmEvaluationBinaryResultMetadata = llmEvaluationResultMetadata.extend({
  configuration: llmEvaluationBinaryConfiguration,
})
const llmEvaluationBinaryResultError = llmEvaluationResultError.extend({})
export const LlmEvaluationBinarySpecification = {
  name: 'Binary',
  description: 'Judges whether the response meets the criteria',
  configuration: llmEvaluationBinaryConfiguration,
  resultMetadata: llmEvaluationBinaryResultMetadata,
  resultError: llmEvaluationBinaryResultError,
  requiresExpectedOutput: false,
  supportsLiveEvaluation: true,
  supportsBatchEvaluation: true,
}
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
  minRating: z.number(),
  minRatingDescription: z.string(),
  maxRating: z.number(),
  maxRatingDescription: z.string(),
  minThreshold: z.number(),
  maxThreshold: z.number(),
})
const llmEvaluationRatingResultMetadata = llmEvaluationResultMetadata.extend({
  configuration: llmEvaluationRatingConfiguration,
})
const llmEvaluationRatingResultError = llmEvaluationResultError.extend({})
export const LlmEvaluationRatingSpecification = {
  name: 'Rating',
  description: 'Judges the response by rating it under a criteria',
  configuration: llmEvaluationRatingConfiguration,
  resultMetadata: llmEvaluationRatingResultMetadata,
  resultError: llmEvaluationRatingResultError,
  requiresExpectedOutput: false,
  supportsLiveEvaluation: true,
  supportsBatchEvaluation: true,
}
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
  minThreshold: z.number(), // Threshold percentage
  maxThreshold: z.number(), // Threshold percentage
})
const llmEvaluationComparisonResultMetadata =
  llmEvaluationResultMetadata.extend({
    configuration: llmEvaluationComparisonConfiguration,
  })
const llmEvaluationComparisonResultError = llmEvaluationResultError.extend({})
export const LlmEvaluationComparisonSpecification = {
  name: 'Comparison',
  description:
    'Judges the response by comparing the criteria to the expected output',
  configuration: llmEvaluationComparisonConfiguration,
  resultMetadata: llmEvaluationComparisonResultMetadata,
  resultError: llmEvaluationComparisonResultError,
  requiresExpectedOutput: true,
  supportsLiveEvaluation: false,
  supportsBatchEvaluation: true,
}
export type LlmEvaluationComparisonConfiguration = z.infer<
  typeof LlmEvaluationComparisonSpecification.configuration
>
export type LlmEvaluationComparisonResultMetadata = z.infer<
  typeof LlmEvaluationComparisonSpecification.resultMetadata
>
export type LlmEvaluationComparisonResultError = z.infer<
  typeof LlmEvaluationComparisonSpecification.resultError
>

/* ------------------------------------------------------------------------- */

export enum LlmEvaluationMetric {
  Binary = 'binary',
  Rating = 'rating',
  Comparison = 'comparison',
}

// prettier-ignore
export type LlmEvaluationConfiguration<M extends LlmEvaluationMetric = LlmEvaluationMetric> =
  M extends LlmEvaluationMetric.Binary ? LlmEvaluationBinaryConfiguration :
  M extends LlmEvaluationMetric.Rating ? LlmEvaluationRatingConfiguration :
  M extends LlmEvaluationMetric.Comparison ? LlmEvaluationComparisonConfiguration :
  never;

// prettier-ignore
export type LlmEvaluationResultMetadata<M extends LlmEvaluationMetric = LlmEvaluationMetric> =
  M extends LlmEvaluationMetric.Binary ? LlmEvaluationBinaryResultMetadata :
  M extends LlmEvaluationMetric.Rating ? LlmEvaluationRatingResultMetadata :
  M extends LlmEvaluationMetric.Comparison ? LlmEvaluationComparisonResultMetadata :
  never;

// prettier-ignore
export type LlmEvaluationResultError<M extends LlmEvaluationMetric = LlmEvaluationMetric> =
  M extends LlmEvaluationMetric.Binary ? LlmEvaluationBinaryResultError :
  M extends LlmEvaluationMetric.Rating ? LlmEvaluationRatingResultError :
  M extends LlmEvaluationMetric.Comparison ? LlmEvaluationComparisonResultError :
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
  },
}
