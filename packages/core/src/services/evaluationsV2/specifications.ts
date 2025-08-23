import { type EvaluationMetric, EvaluationType, type EvaluationV2 } from '../../browser'
import { HumanEvaluationSpecification } from './human'
import { LlmEvaluationSpecification } from './llm'
import { RuleEvaluationSpecification } from './rule'
import type { EvaluationBackendSpecification } from './shared'

export const EVALUATION_SPECIFICATIONS: {
  [T in EvaluationType]: EvaluationBackendSpecification<T>
} = {
  [EvaluationType.Rule]: RuleEvaluationSpecification,
  [EvaluationType.Llm]: LlmEvaluationSpecification,
  [EvaluationType.Human]: HumanEvaluationSpecification,
}

export function getEvaluationTypeSpecification<T extends EvaluationType = EvaluationType>(
  evaluation: EvaluationV2<T>,
) {
  return EVALUATION_SPECIFICATIONS[evaluation.type]
}

export function getEvaluationMetricSpecification<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>(evaluation: EvaluationV2<T, M>) {
  return EVALUATION_SPECIFICATIONS[evaluation.type].metrics[evaluation.metric]
}
