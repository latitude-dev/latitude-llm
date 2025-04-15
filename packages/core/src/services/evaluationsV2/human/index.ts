import {
  EvaluationType,
  HumanEvaluationMetric,
  HumanEvaluationSpecification as specification,
} from '../../../browser'
import { EvaluationMetricBackendSpecification } from '../shared'

// prettier-ignore
const METRICS: {
  [M in HumanEvaluationMetric]: EvaluationMetricBackendSpecification<EvaluationType.Human, M>
} = {
  [HumanEvaluationMetric.Binary]: undefined as any, // TODO(evalsv2): Implement
  [HumanEvaluationMetric.Rating]: undefined as any, // TODO(evalsv2): Implement
  [HumanEvaluationMetric.Comparison]: undefined as any, // TODO(evalsv2): Implement
}

export const HumanEvaluationSpecification = {
  ...specification,
  validate: undefined as any, // TODO(evalsv2): Implement
  annotate: undefined as any, // TODO(evalsv2): Implement
  metrics: METRICS,
}
