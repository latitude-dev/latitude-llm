import {
  EvaluationConfiguration,
  EvaluationMetric,
  EvaluationMetricSpecification,
  EvaluationResultMetadata,
  EvaluationType,
  HumanEvaluationMetric,
  LlmEvaluationMetric,
  RuleEvaluationMetric,
} from '../../../browser'
import { Database } from '../../../client'
import { LatitudeError, TypedResult } from '../../../lib'
import exactMatch from './rule/exactMatch'
import regularExpression from './rule/regularExpression'

export type EvaluationMetricBackendSpecification<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
  C extends EvaluationConfiguration<M> = EvaluationConfiguration<M>,
  R extends EvaluationResultMetadata<M> = EvaluationResultMetadata<M>,
> = EvaluationMetricSpecification<T, M, C, R> & {
  validate: (
    args: { configuration: C },
    db?: Database,
  ) => Promise<TypedResult<C, LatitudeError>>
}

// prettier-ignore
export type EvaluationMetricSpecifications = {
  [T in EvaluationType]: { [M in EvaluationMetric<T>]: EvaluationMetricBackendSpecification<T, M> }
}

export const EVALUATION_METRIC_SPECIFICATIONS: EvaluationMetricSpecifications =
  {
    [EvaluationType.Rule]: {
      [RuleEvaluationMetric.ExactMatch]: exactMatch,
      [RuleEvaluationMetric.RegularExpression]: regularExpression,
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
// eslint-disable-next-line no-redeclare
export function getEvaluationMetricSpecification<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
  C extends EvaluationConfiguration<M> = EvaluationConfiguration<M>,
  R extends EvaluationResultMetadata<M> = EvaluationResultMetadata<M>,
>(type: T, metric: M): EvaluationMetricBackendSpecification<T, M, C, R> | undefined

// prettier-ignore
// eslint-disable-next-line no-redeclare
export function getEvaluationMetricSpecification<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
  R extends EvaluationResultMetadata<M> = EvaluationResultMetadata<M>,
  C extends EvaluationConfiguration<M> = EvaluationConfiguration<M>,
>(type: T, metric: M): EvaluationMetricBackendSpecification<T, M, C, R> | undefined

// prettier-ignore
// eslint-disable-next-line no-redeclare
export function getEvaluationMetricSpecification<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
  C extends EvaluationConfiguration<M>,
  R extends EvaluationResultMetadata<M>,
>(type: T, metric: M): EvaluationMetricBackendSpecification<T, M, C, R> | undefined {
  return EVALUATION_METRIC_SPECIFICATIONS[type]?.[metric] as any
}
