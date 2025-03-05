import {
  EvaluationConfiguration,
  EvaluationMetric,
  EvaluationResultMetadata,
  EvaluationType,
  HumanEvaluationMetric,
  LlmEvaluationMetric,
  RuleEvaluationMetric,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui'

export type EvaluationMetricSpecification<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
  _C extends EvaluationConfiguration<M> = EvaluationConfiguration<M>,
  _R extends EvaluationResultMetadata<M> = EvaluationResultMetadata<M>,
> = {
  name: string
  description: string
  icon: IconName
}

// prettier-ignore
export type EvaluationMetricSpecifications = {
  [T in EvaluationType]: { [M in EvaluationMetric<T>]: EvaluationMetricSpecification<T, M> }
}

export const EVALUATION_METRIC_SPECIFICATIONS: EvaluationMetricSpecifications =
  {
    [EvaluationType.Rule]: {
      [RuleEvaluationMetric.ExactMatch]: {
        name: 'Exact Match',
        description:
          'Checks if the response is exactly the same as the expected label',
        icon: 'equal',
      },
      [RuleEvaluationMetric.RegularExpression]: {
        name: 'Regular Expression',
        description: 'Checks if the response matches the regular expression',
        icon: 'regex',
      },
      [RuleEvaluationMetric.LengthCount]: undefined as any, // TODO: Implement
      [RuleEvaluationMetric.LexicalOverlap]: undefined as any, // TODO: Implement
      [RuleEvaluationMetric.SemanticSimilarity]: undefined as any, // TODO: Implement
    },
    [EvaluationType.Llm]: {
      [LlmEvaluationMetric.Binary]: undefined as any, // TODO: Implement
      [LlmEvaluationMetric.Rating]: undefined as any, // TODO: Implement
      [LlmEvaluationMetric.Comparison]: undefined as any, // TODO: Implement
    },
    [EvaluationType.Human]: {
      [HumanEvaluationMetric.Binary]: undefined as any, // TODO: Implement
      [HumanEvaluationMetric.Rating]: undefined as any, // TODO: Implement
      [HumanEvaluationMetric.Comparison]: undefined as any, // TODO: Implement
    },
  }

// prettier-ignore
export function getEvaluationMetricSpecification<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
  C extends EvaluationConfiguration<M> = EvaluationConfiguration<M>,
  R extends EvaluationResultMetadata<M> = EvaluationResultMetadata<M>,
>(type: T, metric: M): EvaluationMetricSpecification<T, M, C, R> | undefined

// prettier-ignore
export function getEvaluationMetricSpecification<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
  R extends EvaluationResultMetadata<M> = EvaluationResultMetadata<M>,
  C extends EvaluationConfiguration<M> = EvaluationConfiguration<M>,
>(type: T, metric: M): EvaluationMetricSpecification<T, M, C, R> | undefined

export function getEvaluationMetricSpecification<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
  C extends EvaluationConfiguration<M>,
  R extends EvaluationResultMetadata<M>,
>(type: T, metric: M): EvaluationMetricSpecification<T, M, C, R> | undefined {
  return EVALUATION_METRIC_SPECIFICATIONS[type]?.[metric] as any
}
