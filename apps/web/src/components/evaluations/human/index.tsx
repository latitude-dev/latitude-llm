import {
  EvaluationType,
  HumanEvaluationMetric,
  HumanEvaluationSpecification,
} from '@latitude-data/constants'
import { EvaluationMetricFrontendSpecification } from '../index'

// prettier-ignore
const METRICS: {
  [M in HumanEvaluationMetric]: EvaluationMetricFrontendSpecification<EvaluationType.Human, M>
} = {
  [HumanEvaluationMetric.Binary]: undefined as any, // TODO: Implement
  [HumanEvaluationMetric.Rating]: undefined as any, // TODO: Implement
  [HumanEvaluationMetric.Comparison]: undefined as any, // TODO: Implement
}

const specification = HumanEvaluationSpecification
export default {
  ...specification,
  ConfigurationForm: undefined as any, // TODO: Implement
  metrics: METRICS,
}
