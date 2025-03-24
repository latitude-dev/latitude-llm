import { z } from 'zod'
import {
  BaseEvaluationConfiguration,
  BaseEvaluationResultError,
  BaseEvaluationResultMetadata,
} from './shared'

const humanEvaluationConfiguration = BaseEvaluationConfiguration.extend({
  instructions: z.string(),
})
const humanEvaluationResultMetadata = BaseEvaluationResultMetadata.extend({
  reason: z.string(),
})
const humanEvaluationResultError = BaseEvaluationResultError.extend({})

// BINARY

const humanEvaluationBinaryConfiguration = humanEvaluationConfiguration.extend({
  passDescription: z.string(),
  failDescription: z.string(),
})
const humanEvaluationBinaryResultMetadata =
  humanEvaluationResultMetadata.extend({
    configuration: humanEvaluationBinaryConfiguration,
  })
const humanEvaluationBinaryResultError = humanEvaluationResultError.extend({})
export const HumanEvaluationBinarySpecification = {
  name: 'Binary',
  description: 'Judges whether the response meets the criteria',
  configuration: humanEvaluationBinaryConfiguration,
  resultMetadata: humanEvaluationBinaryResultMetadata,
  resultError: humanEvaluationBinaryResultError,
  requiresExpectedOutput: false,
  supportsLiveEvaluation: false,
  supportsBatchEvaluation: false,
}
export type HumanEvaluationBinaryConfiguration = z.infer<
  typeof HumanEvaluationBinarySpecification.configuration
>
export type HumanEvaluationBinaryResultMetadata = z.infer<
  typeof HumanEvaluationBinarySpecification.resultMetadata
>
export type HumanEvaluationBinaryResultError = z.infer<
  typeof HumanEvaluationBinarySpecification.resultError
>

// RATING

const humanEvaluationRatingConfiguration = humanEvaluationConfiguration.extend({
  minRating: z.number(),
  minRatingDescription: z.string(),
  maxRating: z.number(),
  maxRatingDescription: z.string(),
  minThreshold: z.number(),
  maxThreshold: z.number(),
})
const humanEvaluationRatingResultMetadata =
  humanEvaluationResultMetadata.extend({
    configuration: humanEvaluationRatingConfiguration,
  })
const humanEvaluationRatingResultError = humanEvaluationResultError.extend({})
export const HumanEvaluationRatingSpecification = {
  name: 'Rating',
  description: 'Judges the response by rating it under a criteria',
  configuration: humanEvaluationRatingConfiguration,
  resultMetadata: humanEvaluationRatingResultMetadata,
  resultError: humanEvaluationRatingResultError,
  requiresExpectedOutput: false,
  supportsLiveEvaluation: false,
  supportsBatchEvaluation: false,
}
export type HumanEvaluationRatingConfiguration = z.infer<
  typeof HumanEvaluationRatingSpecification.configuration
>
export type HumanEvaluationRatingResultMetadata = z.infer<
  typeof HumanEvaluationRatingSpecification.resultMetadata
>
export type HumanEvaluationRatingResultError = z.infer<
  typeof HumanEvaluationRatingSpecification.resultError
>

// COMPARISON

const humanEvaluationComparisonConfiguration =
  humanEvaluationConfiguration.extend({
    minThreshold: z.number(), // Threshold percentage
    maxThreshold: z.number(), // Threshold percentage
  })
const humanEvaluationComparisonResultMetadata =
  humanEvaluationResultMetadata.extend({
    configuration: humanEvaluationComparisonConfiguration,
  })
const humanEvaluationComparisonResultError = humanEvaluationResultError.extend(
  {},
)
export const HumanEvaluationComparisonSpecification = {
  name: 'Comparison',
  description:
    'Judges the response by comparing the criteria to the expected output',
  configuration: humanEvaluationComparisonConfiguration,
  resultMetadata: humanEvaluationComparisonResultMetadata,
  resultError: humanEvaluationComparisonResultError,
  requiresExpectedOutput: true,
  supportsLiveEvaluation: false,
  supportsBatchEvaluation: false,
}
export type HumanEvaluationComparisonConfiguration = z.infer<
  typeof HumanEvaluationComparisonSpecification.configuration
>
export type HumanEvaluationComparisonResultMetadata = z.infer<
  typeof HumanEvaluationComparisonSpecification.resultMetadata
>
export type HumanEvaluationComparisonResultError = z.infer<
  typeof HumanEvaluationComparisonSpecification.resultError
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

// prettier-ignore
export type HumanEvaluationResultError<M extends HumanEvaluationMetric = HumanEvaluationMetric> =
  M extends HumanEvaluationMetric.Binary ? HumanEvaluationBinaryResultError :
  M extends HumanEvaluationMetric.Rating ? HumanEvaluationRatingResultError :
  M extends HumanEvaluationMetric.Comparison ? HumanEvaluationComparisonResultError :
  never;

export const HumanEvaluationSpecification = {
  name: 'Human-in-the-Loop',
  description: 'Evaluate responses using a human as a judge',
  configuration: humanEvaluationConfiguration,
  resultMetadata: humanEvaluationResultMetadata,
  resultError: humanEvaluationResultError,
  // prettier-ignore
  metrics: {
    [HumanEvaluationMetric.Binary]: HumanEvaluationBinarySpecification,
    [HumanEvaluationMetric.Rating]: HumanEvaluationRatingSpecification,
    [HumanEvaluationMetric.Comparison]: HumanEvaluationComparisonSpecification,
  },
}
