import {
  LlmEvaluationMetric,
  LlmEvaluationSpecification,
} from '@latitude-data/constants'

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
