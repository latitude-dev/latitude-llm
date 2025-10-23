import { z } from 'zod'
import { EvaluationResultSuccessValue, EvaluationType } from './index'
import {
  baseEvaluationConfiguration,
  baseEvaluationResultError,
  baseEvaluationResultMetadata,
} from './shared'

const humanEvaluationConfiguration = baseEvaluationConfiguration.extend({
  enableControls: z.boolean().optional(),
  criteria: z.string().optional(),
})
const humanEvaluationResultMetadata = baseEvaluationResultMetadata.extend({
  reason: z.string().optional(),
})
const humanEvaluationResultError = baseEvaluationResultError.extend({})

// BINARY

const humanEvaluationBinaryConfiguration = humanEvaluationConfiguration.extend({
  passDescription: z.string().optional(),
  failDescription: z.string().optional(),
})
const humanEvaluationBinaryResultMetadata =
  humanEvaluationResultMetadata.extend({
    configuration: humanEvaluationBinaryConfiguration,
  })
const humanEvaluationBinaryResultError = humanEvaluationResultError.extend({})
export const HumanEvaluationBinarySpecification = {
  name: 'Binary',
  description:
    'Judges whether the response meets the criteria. The resulting score is "passed" or "failed"',
  configuration: humanEvaluationBinaryConfiguration,
  resultMetadata: humanEvaluationBinaryResultMetadata,
  resultError: humanEvaluationBinaryResultError,
  resultReason: (
    result: EvaluationResultSuccessValue<
      EvaluationType.Human,
      HumanEvaluationMetric.Binary
    >,
  ) => {
    return result.metadata.reason
  },
  requiresExpectedOutput: false,
  supportsLiveEvaluation: false,
  supportsBatchEvaluation: false,
  supportsManualEvaluation: true,
} as const
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
  minRatingDescription: z.string().optional(),
  maxRating: z.number(),
  maxRatingDescription: z.string().optional(),
  minThreshold: z.number().optional(), // Threshold in rating range
  maxThreshold: z.number().optional(), // Threshold in rating range
})
const humanEvaluationRatingResultMetadata =
  humanEvaluationResultMetadata.extend({
    configuration: humanEvaluationRatingConfiguration,
  })
const humanEvaluationRatingResultError = humanEvaluationResultError.extend({})
export const HumanEvaluationRatingSpecification = {
  name: 'Rating',
  description:
    'Judges the response by rating it under a criteria. The resulting score is the rating',
  configuration: humanEvaluationRatingConfiguration,
  resultMetadata: humanEvaluationRatingResultMetadata,
  resultError: humanEvaluationRatingResultError,
  resultReason: (
    result: EvaluationResultSuccessValue<
      EvaluationType.Human,
      HumanEvaluationMetric.Rating
    >,
  ) => {
    return result.metadata.reason
  },
  requiresExpectedOutput: false,
  supportsLiveEvaluation: false,
  supportsBatchEvaluation: false,
  supportsManualEvaluation: true,
} as const
export type HumanEvaluationRatingConfiguration = z.infer<
  typeof HumanEvaluationRatingSpecification.configuration
>
export type HumanEvaluationRatingResultMetadata = z.infer<
  typeof HumanEvaluationRatingSpecification.resultMetadata
>
export type HumanEvaluationRatingResultError = z.infer<
  typeof HumanEvaluationRatingSpecification.resultError
>

/* ------------------------------------------------------------------------- */

export enum HumanEvaluationMetric {
  Binary = 'binary',
  Rating = 'rating',
}

// prettier-ignore
export type HumanEvaluationConfiguration<M extends HumanEvaluationMetric = HumanEvaluationMetric> =
  M extends HumanEvaluationMetric.Binary ? HumanEvaluationBinaryConfiguration :
  M extends HumanEvaluationMetric.Rating ? HumanEvaluationRatingConfiguration :
  never;

// prettier-ignore
export type HumanEvaluationResultMetadata<M extends HumanEvaluationMetric = HumanEvaluationMetric> =
  M extends HumanEvaluationMetric.Binary ? HumanEvaluationBinaryResultMetadata :
  M extends HumanEvaluationMetric.Rating ? HumanEvaluationRatingResultMetadata :
  never;

// prettier-ignore
export type HumanEvaluationResultError<M extends HumanEvaluationMetric = HumanEvaluationMetric> =
  M extends HumanEvaluationMetric.Binary ? HumanEvaluationBinaryResultError :
  M extends HumanEvaluationMetric.Rating ? HumanEvaluationRatingResultError :
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
  },
} as const
