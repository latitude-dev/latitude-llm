import {
  EvaluationType,
  LlmEvaluationMetric,
  LlmEvaluationSpecification,
} from '../../../browser'
import { EvaluationMetricBackendSpecification } from '../shared'

// prettier-ignore
const METRICS: {
  [M in LlmEvaluationMetric]: EvaluationMetricBackendSpecification<EvaluationType.Llm, M>
} = {
  [LlmEvaluationMetric.Binary]: undefined as any, // TODO: Implement
  [LlmEvaluationMetric.Rating]: undefined as any, // TODO: Implement
  [LlmEvaluationMetric.Comparison]: undefined as any, // TODO: Implement
}

const specification = LlmEvaluationSpecification
export default {
  ...specification,
  validate: undefined as any, // TODO: Implement
  metrics: METRICS,
}
