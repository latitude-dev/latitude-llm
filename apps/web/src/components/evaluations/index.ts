import {
  EvaluationCondition,
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
    mode: 'create' | 'update'
    configuration?: EvaluationConfiguration<T, M>
    onChange?: (configuration: EvaluationConfiguration<T, M>) => void
  }) => React.ReactNode
}

export type EvaluationFrontendSpecification<
  T extends EvaluationType = EvaluationType,
> = Omit<EvaluationSpecification<T>, 'metrics'> & {
  icon: IconName
  ConfigurationForm: <
    M extends EvaluationMetric<T> = EvaluationMetric<T>,
  >(props: {
    mode: 'create' | 'update'
    metric: M
    configuration?: EvaluationConfiguration<T, M>
    onChange?: (configuration: EvaluationConfiguration<T>) => void
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

export type EvaluationConditionDetail = {
  name: string
  description: string
  icon: IconName
}

export const EVALUATION_CONDITION_DETAILS: {
  [T in EvaluationCondition]: EvaluationConditionDetail
} = {
  [EvaluationCondition.Less]: {
    name: 'Less than',
    description:
      'Evaluation will pass if the metric score is less than the threshold',
    icon: 'chevronLeft',
  },
  [EvaluationCondition.LessEqual]: {
    name: 'Less than or equal to',
    description:
      'Evaluation will pass if the metric score is less than or equal to the threshold',
    icon: 'circleChevronLeft',
  },
  [EvaluationCondition.Equal]: {
    name: 'Equal to',
    description:
      'Evaluation will pass if the metric score is equal to the threshold',
    icon: 'equal',
  },
  [EvaluationCondition.NotEqual]: {
    name: 'Not equal to',
    description:
      'Evaluation will pass if the metric score is not equal to the threshold',
    icon: 'notEqual',
  },
  [EvaluationCondition.Greater]: {
    name: 'Greater than',
    description:
      'Evaluation will pass if the metric score is greater than the threshold',
    icon: 'chevronRight',
  },
  [EvaluationCondition.GreaterEqual]: {
    name: 'Greater than or equal to',
    description:
      'Evaluation will pass if the metric score is greater than or equal to the threshold',
    icon: 'circleChevronRight',
  },
}
