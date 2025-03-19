import {
  EvaluationConfiguration,
  EvaluationMetric,
  EvaluationMetricSpecification,
  EvaluationResultV2,
  EvaluationSpecification,
  EvaluationType,
  EvaluationV2,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui'
import React from 'react'
import HumanEvaluationSpecification from './human'
import LlmEvaluationSpecification from './llm'
import RuleEvaluationSpecification from './rule'

export type ConfigurationFormProps<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  mode: 'create' | 'update'
  configuration: EvaluationConfiguration<T, M>
  setConfiguration: (configuration: EvaluationConfiguration<T, M>) => void
  disabled?: boolean
}

export type ResultBadgeProps<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  evaluation: EvaluationV2<T, M>
  result: EvaluationResultV2<T, M>
}

export type EvaluationMetricFrontendSpecification<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = EvaluationMetricSpecification<T, M> & {
  icon: IconName
  ConfigurationForm: (props: ConfigurationFormProps<T, M>) => React.ReactNode
  ResultBadge: (props: ResultBadgeProps<T, M>) => React.ReactNode
}

export type EvaluationFrontendSpecification<
  T extends EvaluationType = EvaluationType,
> = Omit<EvaluationSpecification<T>, 'metrics'> & {
  icon: IconName
  ConfigurationForm: <M extends EvaluationMetric<T> = EvaluationMetric<T>>(
    props: ConfigurationFormProps<T, M> & { metric: M },
  ) => React.ReactNode
  ResultBadge: <M extends EvaluationMetric<T> = EvaluationMetric<T>>(
    props: ResultBadgeProps<T, M> & { metric: M },
  ) => React.ReactNode
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
