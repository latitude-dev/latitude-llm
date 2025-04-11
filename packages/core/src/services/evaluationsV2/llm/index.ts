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
  [LlmEvaluationMetric.Binary]: undefined as any, // TODO(evalsv2): Implement
  [LlmEvaluationMetric.Rating]: undefined as any, // TODO(evalsv2): Implement
  [LlmEvaluationMetric.Comparison]: undefined as any, // TODO(evalsv2): Implement
}

const specification = LlmEvaluationSpecification
export default {
  ...specification,
  validate: undefined as any, // TODO(evalsv2): Implement
  run: undefined as any, // TODO(evalsv2): Implement (remember to create a run error as a side effect)
  metrics: METRICS,
}
