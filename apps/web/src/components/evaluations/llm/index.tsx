import {
  EvaluationType,
  LlmEvaluationMetric,
  LlmEvaluationSpecification,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { EvaluationMetricFrontendSpecification } from '../index'

// prettier-ignore
const METRICS: {
  [M in LlmEvaluationMetric]: EvaluationMetricFrontendSpecification<EvaluationType.Llm, M>
} = {
  [LlmEvaluationMetric.Binary]: undefined as any, // TODO(evalsv2): Implement
  [LlmEvaluationMetric.Rating]: undefined as any, // TODO(evalsv2): Implement
  [LlmEvaluationMetric.Comparison]: undefined as any, // TODO(evalsv2): Implement
}

const specification = LlmEvaluationSpecification
export default {
  ...specification,
  icon: 'bot' as IconName,
  ConfigurationForm: undefined as any, // TODO(evalsv2): Implement
  ResultBadge: undefined as any, // TODO(evalsv2): Implement
  ResultRowHeaders: undefined as any, // TODO(evalsv2): Implement
  ResultRowCells: undefined as any, // TODO(evalsv2): Implement
  resultPanelTabs: undefined as any, // TODO(evalsv2): Implement
  ResultPanelMetadata: undefined as any, // TODO(evalsv2): Implement
  ResultPanelContent: undefined as any, // TODO(evalsv2): Implement
  chartConfiguration: undefined as any, // TODO(evalsv2): Implement
  metrics: METRICS,
}
