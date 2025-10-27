import { z } from 'zod'
import { EvaluationResultSuccessValue, EvaluationType } from './index'
import {
  baseEvaluationConfiguration,
  baseEvaluationResultError,
  baseEvaluationResultMetadata,
} from './shared'

const compositeEvaluationConfiguration = baseEvaluationConfiguration.extend({
  evaluationUuids: z.array(z.string()),
  minThreshold: z.number().optional(), // Threshold percentage
  maxThreshold: z.number().optional(), // Threshold percentage
})
const compositeEvaluationResultMetadata = baseEvaluationResultMetadata.extend({
  results: z.record(
    z.string(), // Evaluation uuid
    z.object({
      uuid: z.string(), // Result uuid (for side effects)
      name: z.string(), // Evaluation name
      score: z.number(), // Normalized score
      reason: z.string(),
      passed: z.boolean(),
    }),
  ),
})
const compositeEvaluationResultError = baseEvaluationResultError.extend({
  errors: z
    .record(
      z.string(), // Evaluation uuid
      z.object({
        uuid: z.string(), // Result uuid (for side effects)
        name: z.string(), // Evaluation name
        message: z.string(),
      }),
    )
    .optional(),
})

// AVERAGE

const compositeEvaluationAverageConfiguration =
  compositeEvaluationConfiguration.extend({})
const compositeEvaluationAverageResultMetadata =
  compositeEvaluationResultMetadata.extend({
    configuration: compositeEvaluationAverageConfiguration,
  })
const compositeEvaluationAverageResultError =
  compositeEvaluationResultError.extend({})
export const CompositeEvaluationAverageSpecification = {
  name: 'Average',
  description: 'Combines scores evenly. The resulting score is the average',
  configuration: compositeEvaluationAverageConfiguration,
  resultMetadata: compositeEvaluationAverageResultMetadata,
  resultError: compositeEvaluationAverageResultError,
  resultReason: (
    result: EvaluationResultSuccessValue<
      EvaluationType.Composite,
      CompositeEvaluationMetric.Average
    >,
  ) => {
    let reason = ''

    const reasons = Object.entries(result.metadata.results).map(
      ([_, result]) => `${result.name}: ${result.reason}`,
    )

    reason = reasons.join('\n\n')

    return reason
  },
  requiresExpectedOutput: false,
  supportsLiveEvaluation: false,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
} as const
export type CompositeEvaluationAverageConfiguration = z.infer<
  typeof CompositeEvaluationAverageSpecification.configuration
>
export type CompositeEvaluationAverageResultMetadata = z.infer<
  typeof CompositeEvaluationAverageSpecification.resultMetadata
>
export type CompositeEvaluationAverageResultError = z.infer<
  typeof CompositeEvaluationAverageSpecification.resultError
>

// WEIGHTED

const compositeEvaluationWeightedConfiguration =
  compositeEvaluationConfiguration.extend({
    weights: z.record(
      z.string(), // Evaluation uuid
      z.number(), // Weight in percentage
    ),
  })
const compositeEvaluationWeightedResultMetadata =
  compositeEvaluationResultMetadata.extend({
    configuration: compositeEvaluationWeightedConfiguration,
  })
const compositeEvaluationWeightedResultError =
  compositeEvaluationResultError.extend({})
export const CompositeEvaluationWeightedSpecification = {
  name: 'Weighted',
  description:
    'Combines scores using custom weights. The resulting score is the weighted blend',
  configuration: compositeEvaluationWeightedConfiguration,
  resultMetadata: compositeEvaluationWeightedResultMetadata,
  resultError: compositeEvaluationWeightedResultError,
  resultReason: (
    result: EvaluationResultSuccessValue<
      EvaluationType.Composite,
      CompositeEvaluationMetric.Weighted
    >,
  ) => {
    let reason = ''

    const reasons = Object.entries(result.metadata.results).map(
      ([_, result]) => `${result.name}: ${result.reason}`,
    )

    reason = reasons.join('\n\n')

    return reason
  },
  requiresExpectedOutput: false,
  supportsLiveEvaluation: false,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
} as const
export type CompositeEvaluationWeightedConfiguration = z.infer<
  typeof CompositeEvaluationWeightedSpecification.configuration
>
export type CompositeEvaluationWeightedResultMetadata = z.infer<
  typeof CompositeEvaluationWeightedSpecification.resultMetadata
>
export type CompositeEvaluationWeightedResultError = z.infer<
  typeof CompositeEvaluationWeightedSpecification.resultError
>

// CUSTOM

const compositeEvaluationCustomConfiguration =
  compositeEvaluationConfiguration.extend({
    formula: z.string(),
  })
const compositeEvaluationCustomResultMetadata =
  compositeEvaluationResultMetadata.extend({
    configuration: compositeEvaluationCustomConfiguration,
  })
const compositeEvaluationCustomResultError =
  compositeEvaluationResultError.extend({})
export const CompositeEvaluationCustomSpecification = {
  name: 'Custom',
  description:
    'Combines scores using a custom formula. The resulting score is the result of the expression',
  configuration: compositeEvaluationCustomConfiguration,
  resultMetadata: compositeEvaluationCustomResultMetadata,
  resultError: compositeEvaluationCustomResultError,
  resultReason: (
    result: EvaluationResultSuccessValue<
      EvaluationType.Composite,
      CompositeEvaluationMetric.Custom
    >,
  ) => {
    let reason = ''

    const reasons = Object.entries(result.metadata.results).map(
      ([_, result]) => `${result.name}: ${result.reason}`,
    )

    reason = reasons.join('\n\n')

    return reason
  },
  requiresExpectedOutput: false,
  supportsLiveEvaluation: false,
  supportsBatchEvaluation: true,
  supportsManualEvaluation: false,
} as const
export type CompositeEvaluationCustomConfiguration = z.infer<
  typeof CompositeEvaluationCustomSpecification.configuration
>
export type CompositeEvaluationCustomResultMetadata = z.infer<
  typeof CompositeEvaluationCustomSpecification.resultMetadata
>
export type CompositeEvaluationCustomResultError = z.infer<
  typeof CompositeEvaluationCustomSpecification.resultError
>

/* ------------------------------------------------------------------------- */

export enum CompositeEvaluationMetric {
  Average = 'average',
  Weighted = 'weighted',
  Custom = 'custom',
}

// prettier-ignore
export type CompositeEvaluationConfiguration<M extends CompositeEvaluationMetric = CompositeEvaluationMetric> =
  M extends CompositeEvaluationMetric.Average ? CompositeEvaluationAverageConfiguration :
  M extends CompositeEvaluationMetric.Weighted ? CompositeEvaluationWeightedConfiguration :
  M extends CompositeEvaluationMetric.Custom ? CompositeEvaluationCustomConfiguration :
  never;

// prettier-ignore
export type CompositeEvaluationResultMetadata<M extends CompositeEvaluationMetric = CompositeEvaluationMetric> = 
  M extends CompositeEvaluationMetric.Average ? CompositeEvaluationAverageResultMetadata :
  M extends CompositeEvaluationMetric.Weighted ? CompositeEvaluationWeightedResultMetadata :
  M extends CompositeEvaluationMetric.Custom ? CompositeEvaluationCustomResultMetadata :
  never;

// prettier-ignore
export type CompositeEvaluationResultError<M extends CompositeEvaluationMetric = CompositeEvaluationMetric> = 
  M extends CompositeEvaluationMetric.Average ? CompositeEvaluationAverageResultError :
  M extends CompositeEvaluationMetric.Weighted ? CompositeEvaluationWeightedResultError :
  M extends CompositeEvaluationMetric.Custom ? CompositeEvaluationCustomResultError :
  never;

export const CompositeEvaluationSpecification = {
  name: 'Composite Score',
  description: 'Evaluate responses combining several evaluations at once',
  configuration: compositeEvaluationConfiguration,
  resultMetadata: compositeEvaluationResultMetadata,
  resultError: compositeEvaluationResultError,
  // prettier-ignore
  metrics: {
    [CompositeEvaluationMetric.Average]: CompositeEvaluationAverageSpecification,
    [CompositeEvaluationMetric.Weighted]: CompositeEvaluationWeightedSpecification,
    [CompositeEvaluationMetric.Custom]: CompositeEvaluationCustomSpecification,
  },
} as const
