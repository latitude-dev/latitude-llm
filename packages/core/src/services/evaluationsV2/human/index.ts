import {
  EvaluationType,
  HumanEvaluationMetric,
  HumanEvaluationSpecification,
} from '../../../browser'
import { EvaluationMetricBackendSpecification } from '../shared'

// prettier-ignore
const METRICS: {
  [M in HumanEvaluationMetric]: EvaluationMetricBackendSpecification<EvaluationType.Human, M>
} = {
  [HumanEvaluationMetric.Binary]: undefined as any, // TODO: Implement
  [HumanEvaluationMetric.Rating]: undefined as any, // TODO: Implement
  [HumanEvaluationMetric.Comparison]: undefined as any, // TODO: Implement
}

const specification = HumanEvaluationSpecification
export default {
  ...specification,
  validate: undefined as any, // TODO: Implement
  metrics: METRICS,
}
