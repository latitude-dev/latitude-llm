import { EvaluationMetric, EvaluationType, EvaluationV2 } from '../../constants'
import { CompositeEvaluationSpecification } from './composite'
import { HumanEvaluationSpecification } from './human'
import { LlmEvaluationSpecification } from './llm'
import { RuleEvaluationSpecification } from './rule'
import { EvaluationBackendSpecification } from './shared'

export const EVALUATION_SPECIFICATIONS: {
  [T in EvaluationType]: EvaluationBackendSpecification<T>
} = {
  [EvaluationType.Rule]: RuleEvaluationSpecification,
  [EvaluationType.Llm]: LlmEvaluationSpecification,
  [EvaluationType.Human]: HumanEvaluationSpecification,
  [EvaluationType.Composite]: CompositeEvaluationSpecification,
}

export function getEvaluationTypeSpecification<
  T extends EvaluationType = EvaluationType,
>(evaluation: EvaluationV2<T>) {
  return EVALUATION_SPECIFICATIONS[evaluation.type]
}

export function getEvaluationMetricSpecification<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>(evaluation: EvaluationV2<T, M>) {
  return EVALUATION_SPECIFICATIONS[evaluation.type].metrics[evaluation.metric]
}
