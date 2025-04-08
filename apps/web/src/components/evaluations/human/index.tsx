import {
  EvaluationType,
  HumanEvaluationMetric,
  HumanEvaluationSpecification,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { EvaluationMetricFrontendSpecification } from '../index'

// prettier-ignore
const METRICS: {
  [M in HumanEvaluationMetric]: EvaluationMetricFrontendSpecification<EvaluationType.Human, M>
} = {
  [HumanEvaluationMetric.Binary]: undefined as any, // TODO(evalsv2): Implement
  [HumanEvaluationMetric.Rating]: undefined as any, // TODO(evalsv2): Implement
  [HumanEvaluationMetric.Comparison]: undefined as any, // TODO(evalsv2): Implement
}

const specification = HumanEvaluationSpecification
export default {
  ...specification,
  icon: 'userRound' as IconName,
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
