import { z } from 'zod'
import {
  BaseEvaluationConfiguration,
  BaseEvaluationResultMetadata,
} from './shared'

const llmEvaluationConfiguration = BaseEvaluationConfiguration.extend({
  providerId: z.string(),
  model: z.string(),
  instructions: z.string(),
})
const llmEvaluationResultMetadata = BaseEvaluationResultMetadata.extend({
  evaluationLogId: z.string(),
  reason: z.string(),
})

// BINARY

export const LlmEvaluationBinarySpecification = {
  name: 'Binary',
  description: 'Judges whether the response is correct or incorrect',
  configuration: llmEvaluationConfiguration.extend({
    passDescription: z.string(),
    failDescription: z.string(),
  }),
  resultMetadata: llmEvaluationResultMetadata.extend({}),
  supportsLiveEvaluation: true,
}
export type LlmEvaluationBinaryConfiguration = z.infer<
  typeof LlmEvaluationBinarySpecification.configuration
>
export type LlmEvaluationBinaryResultMetadata = z.infer<
  typeof LlmEvaluationBinarySpecification.resultMetadata
>

// RATING

export const LlmEvaluationRatingSpecification = {
  name: 'Rating',
  description: 'Judges the quality of the response',
  configuration: llmEvaluationConfiguration.extend({
    minRating: z.number(),
    minRatingDescription: z.string(),
    maxRating: z.number(),
    maxRatingDescription: z.string(),
  }),
  resultMetadata: llmEvaluationResultMetadata.extend({}),
  supportsLiveEvaluation: true,
}
export type LlmEvaluationRatingConfiguration = z.infer<
  typeof LlmEvaluationRatingSpecification.configuration
>
export type LlmEvaluationRatingResultMetadata = z.infer<
  typeof LlmEvaluationRatingSpecification.resultMetadata
>

// COMPARISON

export const LlmEvaluationComparisonSpecification = {
  name: 'Comparison',
  description: 'Judges whether the response is similar to the expected label',
  configuration: llmEvaluationConfiguration.extend({
    datasetLabel: z.string(),
  }),
  resultMetadata: llmEvaluationResultMetadata.extend({}),
  supportsLiveEvaluation: false,
}
export type LlmEvaluationComparisonConfiguration = z.infer<
  typeof LlmEvaluationComparisonSpecification.configuration
>
export type LlmEvaluationComparisonResultMetadata = z.infer<
  typeof LlmEvaluationComparisonSpecification.resultMetadata
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

export const LlmEvaluationSpecification = {
  name: 'LLM-as-a-Judge',
  description: 'Evaluate responses using an LLM as a judge',
  configuration: llmEvaluationConfiguration,
  resultMetadata: llmEvaluationResultMetadata,
  // prettier-ignore
  metrics: {
    [LlmEvaluationMetric.Binary]: LlmEvaluationBinarySpecification,
    [LlmEvaluationMetric.Rating]: LlmEvaluationRatingSpecification,
    [LlmEvaluationMetric.Comparison]: LlmEvaluationComparisonSpecification,
  },
}
