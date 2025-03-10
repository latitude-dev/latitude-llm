import {
  EvaluationConfiguration,
  EvaluationMetric,
  EvaluationMetricSpecification,
  EvaluationSpecification,
  EvaluationType,
} from '../../browser'
import { Database } from '../../client'
import { LatitudeError, TypedResult } from '../../lib'
import HumanEvaluationSpecification from './human'
import LlmEvaluationSpecification from './llm'
import RuleEvaluationSpecification from './rule'

export type EvaluationMetricBackendSpecification<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = EvaluationMetricSpecification<T, M> & {
  validate: (
    args: { configuration: EvaluationConfiguration<T, M> },
    db?: Database,
  ) => Promise<TypedResult<EvaluationConfiguration<T, M>, LatitudeError>>
}

export type EvaluationBackendSpecification<
  T extends EvaluationType = EvaluationType,
> = Omit<EvaluationSpecification<T>, 'metrics'> & {
  validate: <M extends EvaluationMetric<T> = EvaluationMetric<T>>(
    args: { metric: M; configuration: EvaluationConfiguration<T, M> },
    db?: Database,
  ) => Promise<TypedResult<EvaluationConfiguration<T, M>, LatitudeError>>
  metrics: {
    [M in EvaluationMetric<T>]: EvaluationMetricBackendSpecification<T, M>
  }
}

export const EVALUATION_SPECIFICATIONS: {
  [T in EvaluationType]: EvaluationBackendSpecification<T>
} = {
  [EvaluationType.Rule]: RuleEvaluationSpecification,
  [EvaluationType.Llm]: LlmEvaluationSpecification,
  [EvaluationType.Human]: HumanEvaluationSpecification,
}
