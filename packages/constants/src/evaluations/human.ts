import { z } from 'zod'
import {
  BaseEvaluationConfiguration,
  BaseEvaluationResultMetadata,
} from './shared'

const HumanEvaluationConfiguration = BaseEvaluationConfiguration.extend({
  Instructions: z.string(),
})
const HumanEvaluationResultMetadata = BaseEvaluationResultMetadata.extend({
  Reason: z.string(),
})

export enum HumanEvaluationMetric {
  Binary = 'binary',
  Rating = 'rating',
  Comparison = 'comparison',
}

// BINARY

export const HumanEvaluationBinarySpecification = {
  name: 'Binary',
  description: 'Judges whether the response is correct or incorrect',
  configuration: HumanEvaluationConfiguration.extend({
    PassDescription: z.string(),
    FailDescription: z.string(),
  }),
  resultMetadata: HumanEvaluationResultMetadata.extend({}),
}
export type HumanEvaluationBinaryConfiguration = z.infer<
  typeof HumanEvaluationBinarySpecification.configuration
>
export type HumanEvaluationBinaryResultMetadata = z.infer<
  typeof HumanEvaluationBinarySpecification.resultMetadata
>
// RATING

export const HumanEvaluationRatingSpecification = {
  name: 'Rating',
  description: 'Judges the quality of the response',
  configuration: HumanEvaluationConfiguration.extend({
    MinRating: z.number(),
    MinRatingDescription: z.string(),
    MaxRating: z.number(),
    MaxRatingDescription: z.string(),
  }),
  resultMetadata: HumanEvaluationResultMetadata.extend({}),
}
export type HumanEvaluationRatingConfiguration = z.infer<
  typeof HumanEvaluationRatingSpecification.configuration
>
export type HumanEvaluationRatingResultMetadata = z.infer<
  typeof HumanEvaluationRatingSpecification.resultMetadata
>
// COMPARISON

export const HumanEvaluationComparisonSpecification = {
  name: 'Comparison',
  description: 'Judges whether the response is similar to the expected label',
  configuration: HumanEvaluationConfiguration.extend({
    DatasetLabel: z.string(),
  }),
  resultMetadata: HumanEvaluationResultMetadata.extend({}),
}
export type HumanEvaluationComparisonConfiguration = z.infer<
  typeof HumanEvaluationComparisonSpecification.configuration
>
export type HumanEvaluationComparisonResultMetadata = z.infer<
  typeof HumanEvaluationComparisonSpecification.resultMetadata
>
