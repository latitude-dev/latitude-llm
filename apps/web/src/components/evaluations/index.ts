import {
  EvaluationConfiguration,
  EvaluationMetric,
  EvaluationMetricSpecification,
  EvaluationSpecification,
  EvaluationType,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui'
import React from 'react'
import HumanEvaluationSpecification from './human'
import LlmEvaluationSpecification from './llm'
import RuleEvaluationSpecification from './rule'

export type EvaluationMetricFrontendSpecification<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = EvaluationMetricSpecification<T, M> & {
  icon: IconName
  ConfigurationForm: (props: {
    configuration: EvaluationConfiguration<T, M>
    onChange: (configuration: EvaluationConfiguration<T, M>) => void
  }) => React.ReactNode
}

export type EvaluationFrontendSpecification<
  T extends EvaluationType = EvaluationType,
> = Omit<EvaluationSpecification<T>, 'metrics'> & {
  ConfigurationForm: <
    M extends EvaluationMetric<T> = EvaluationMetric<T>,
  >(props: {
    metric: M
    configuration: EvaluationConfiguration<T, M>
    onChange: (configuration: EvaluationConfiguration<T>) => void
  }) => React.ReactNode
  metrics: {
    [M in EvaluationMetric<T>]: EvaluationMetricFrontendSpecification<T, M>
  }
}

export const EVALUATION_SPECIFICATIONS: {
  [T in EvaluationType]: EvaluationFrontendSpecification<T>
} = {
  [EvaluationType.Rule]: RuleEvaluationSpecification,
  [EvaluationType.Llm]: LlmEvaluationSpecification,
  [EvaluationType.Human]: HumanEvaluationSpecification,
}
