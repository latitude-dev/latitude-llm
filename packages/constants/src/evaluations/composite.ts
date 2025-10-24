import { z } from 'zod'
import { EvaluationResultSuccessValue, EvaluationType } from './index'
import {
  baseEvaluationConfiguration,
  baseEvaluationResultError,
  baseEvaluationResultMetadata,
} from './shared'

// TODO(AO): Maybe i need to store an evaluations object with uuid, name, type, metric?
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
      name: z.string(),
      score: z.number(), // Normalized score
      reason: z.string(),
    }),
  ),
})
const compositeEvaluationResultError = baseEvaluationResultError.extend({
  errors: z
    .record(
      z.string(), // Evaluation uuid
      z.object({
        uuid: z.string(), // Result uuid (for side effects)
        name: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
})

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

// TODO(AO): Average: Combines scores evenly. The resulting score is the average

// TODO(AO): Weighted: Combines scores using custom weights. The resulting score is the weighted blend

/* ------------------------------------------------------------------------- */

export enum CompositeEvaluationMetric {
  Custom = 'custom',
}

// prettier-ignore
export type CompositeEvaluationConfiguration<M extends CompositeEvaluationMetric = CompositeEvaluationMetric> = 
  M extends CompositeEvaluationMetric.Custom ? CompositeEvaluationCustomConfiguration :
  never;

// prettier-ignore
export type CompositeEvaluationResultMetadata<M extends CompositeEvaluationMetric = CompositeEvaluationMetric> = 
  M extends CompositeEvaluationMetric.Custom ? CompositeEvaluationCustomResultMetadata :
  never;

// prettier-ignore
export type CompositeEvaluationResultError<M extends CompositeEvaluationMetric = CompositeEvaluationMetric> = 
  M extends CompositeEvaluationMetric.Custom ? CompositeEvaluationCustomResultError :
  never;

export const CompositeEvaluationSpecification = {
  name: 'Combined Composite',
  description: 'Evaluate responses combining several evaluations at once',
  configuration: compositeEvaluationConfiguration,
  resultMetadata: compositeEvaluationResultMetadata,
  resultError: compositeEvaluationResultError,
  // prettier-ignore
  metrics: {
    [CompositeEvaluationMetric.Custom]: CompositeEvaluationCustomSpecification,
  },
} as const
