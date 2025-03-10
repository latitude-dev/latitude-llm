import { z } from 'zod'
import {
  BaseEvaluationConfiguration,
  BaseEvaluationResultMetadata,
} from './shared'

const humanEvaluationConfiguration = BaseEvaluationConfiguration.extend({
  instructions: z.string(),
})
const humanEvaluationResultMetadata = BaseEvaluationResultMetadata.extend({
  reason: z.string(),
})

// BINARY

export const HumanEvaluationBinarySpecification = {
  name: 'Binary',
  description: 'Judges whether the response is correct or incorrect',
  configuration: humanEvaluationConfiguration.extend({
    passDescription: z.string(),
    failDescription: z.string(),
  }),
  resultMetadata: humanEvaluationResultMetadata.extend({}),
  supportsLiveEvaluation: false,
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
  configuration: humanEvaluationConfiguration.extend({
    minRating: z.number(),
    minRatingDescription: z.string(),
    maxRating: z.number(),
    maxRatingDescription: z.string(),
  }),
  resultMetadata: humanEvaluationResultMetadata.extend({}),
  supportsLiveEvaluation: false,
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
  configuration: humanEvaluationConfiguration.extend({
    datasetLabel: z.string(),
  }),
  resultMetadata: humanEvaluationResultMetadata.extend({}),
  supportsLiveEvaluation: false,
}
export type HumanEvaluationComparisonConfiguration = z.infer<
  typeof HumanEvaluationComparisonSpecification.configuration
>
export type HumanEvaluationComparisonResultMetadata = z.infer<
  typeof HumanEvaluationComparisonSpecification.resultMetadata
>

/* ------------------------------------------------------------------------- */

export enum HumanEvaluationMetric {
  Binary = 'binary',
  Rating = 'rating',
  Comparison = 'comparison',
}

// prettier-ignore
export type HumanEvaluationConfiguration<M extends HumanEvaluationMetric = HumanEvaluationMetric> =
  M extends HumanEvaluationMetric.Binary ? HumanEvaluationBinaryConfiguration :
  M extends HumanEvaluationMetric.Rating ? HumanEvaluationRatingConfiguration :
  M extends HumanEvaluationMetric.Comparison ? HumanEvaluationComparisonConfiguration :
  never;

// prettier-ignore
export type HumanEvaluationResultMetadata<M extends HumanEvaluationMetric = HumanEvaluationMetric> =
  M extends HumanEvaluationMetric.Binary ? HumanEvaluationBinaryResultMetadata :
  M extends HumanEvaluationMetric.Rating ? HumanEvaluationRatingResultMetadata :
  M extends HumanEvaluationMetric.Comparison ? HumanEvaluationComparisonResultMetadata :
  never;

export const HumanEvaluationSpecification = {
  name: 'Human-in-the-Loop',
  description: 'Evaluate responses using a human as a judge',
  configuration: humanEvaluationConfiguration,
  resultMetadata: humanEvaluationResultMetadata,
  // prettier-ignore
  metrics: {
    [HumanEvaluationMetric.Binary]: HumanEvaluationBinarySpecification,
    [HumanEvaluationMetric.Rating]: HumanEvaluationRatingSpecification,
    [HumanEvaluationMetric.Comparison]: HumanEvaluationComparisonSpecification,
  },
}
