import { z } from 'zod'
import {
  BaseEvaluationConfiguration,
  BaseEvaluationResultError,
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
const llmEvaluationResultError = BaseEvaluationResultError.extend({
  runErrorId: z.string(),
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
  resultError: llmEvaluationResultError.extend({}),
  supportsLiveEvaluation: true,
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
  resultError: llmEvaluationResultError.extend({}),
  supportsLiveEvaluation: true,
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

export const LlmEvaluationComparisonSpecification = {
  name: 'Comparison',
  description: 'Judges whether the response is similar to the expected label',
  configuration: llmEvaluationConfiguration.extend({
    datasetLabel: z.string(),
  }),
  resultMetadata: llmEvaluationResultMetadata.extend({}),
  resultError: llmEvaluationResultError.extend({}),
  supportsLiveEvaluation: false,
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
