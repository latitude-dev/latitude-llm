import {
  EvaluationType,
  HumanEvaluationMetric,
  HumanEvaluationSpecification,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui'
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
  icon: 'userRound' as IconName,
  ConfigurationForm: undefined as any, // TODO: Implement
  ResultBadge: undefined as any, // TODO: Implement
  ResultRowHeaders: undefined as any, // TODO: Implement
  ResultRowCells: undefined as any, // TODO: Implement
  resultPanelTabs: [], // TODO: Implement
  ResultPanelMetadata: undefined as any, // TODO: Implement
  ResultPanelContent: undefined as any, // TODO: Implement
  metrics: METRICS,
}
