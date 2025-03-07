import {
  LlmEvaluationMetric,
  LlmEvaluationSpecification,
} from '../../../browser'

const specification = LlmEvaluationSpecification
export default {
  ...specification,
  // prettier-ignore
  metrics: {
    [LlmEvaluationMetric.Binary]: undefined as any, // TODO: Implement
    [LlmEvaluationMetric.Rating]: undefined as any, // TODO: Implement
    [LlmEvaluationMetric.Comparison]: undefined as any, // TODO: Implement
  },
}
