import {
  HumanEvaluationMetric,
  HumanEvaluationSpecification,
} from '../../../browser'

const specification = HumanEvaluationSpecification
export default {
  ...specification,
  // prettier-ignore
  metrics: {
    [HumanEvaluationMetric.Binary]: undefined as any, // TODO: Implement
    [HumanEvaluationMetric.Rating]: undefined as any, // TODO: Implement
    [HumanEvaluationMetric.Comparison]: undefined as any, // TODO: Implement
  },
}
