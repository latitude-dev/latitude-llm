import { z } from 'zod'
import {
  BaseEvaluationConfiguration,
  BaseEvaluationResultMetadata,
} from './shared'

const LlmEvaluationConfiguration = BaseEvaluationConfiguration.extend({
  ProviderId: z.string(),
  Model: z.string(),
  Instructions: z.string(),
})
const LlmEvaluationResultMetadata = BaseEvaluationResultMetadata.extend({
  EvaluationLogId: z.string(),
  Reason: z.string(),
})

export enum LlmEvaluationMetric {
  Binary = 'binary',
  Rating = 'rating',
  Comparison = 'comparison',
}

// BINARY

export const LlmEvaluationBinarySpecification = {
  name: 'Binary',
  description: 'Judges whether the response is correct or incorrect',
  configuration: LlmEvaluationConfiguration.extend({
    PassDescription: z.string(),
    FailDescription: z.string(),
  }),
  resultMetadata: LlmEvaluationResultMetadata.extend({}),
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
  configuration: LlmEvaluationConfiguration.extend({
    MinRating: z.number(),
    MinRatingDescription: z.string(),
    MaxRating: z.number(),
    MaxRatingDescription: z.string(),
  }),
  resultMetadata: LlmEvaluationResultMetadata.extend({}),
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
  configuration: LlmEvaluationConfiguration.extend({
    DatasetLabel: z.string(),
  }),
  resultMetadata: LlmEvaluationResultMetadata.extend({}),
}
export type LlmEvaluationComparisonConfiguration = z.infer<
  typeof LlmEvaluationComparisonSpecification.configuration
>
export type LlmEvaluationComparisonResultMetadata = z.infer<
  typeof LlmEvaluationComparisonSpecification.resultMetadata
>
