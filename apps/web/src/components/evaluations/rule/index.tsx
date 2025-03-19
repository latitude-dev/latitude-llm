import {
  EvaluationType,
  RuleEvaluationMetric,
  RuleEvaluationSpecification,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui'
import {
  ConfigurationFormProps,
  EvaluationMetricFrontendSpecification,
  ResultBadgeProps,
} from '../index'
import RuleEvaluationExactMatchSpecification from './ExactMatch'
import RuleEvaluationRegularExpressionSpecification from './RegularExpression'

// prettier-ignore
const METRICS: {
  [M in RuleEvaluationMetric]: EvaluationMetricFrontendSpecification<EvaluationType.Rule, M>
} = {
  [RuleEvaluationMetric.ExactMatch]: RuleEvaluationExactMatchSpecification,
  [RuleEvaluationMetric.RegularExpression]: RuleEvaluationRegularExpressionSpecification,
  [RuleEvaluationMetric.LengthCount]:  undefined as any, // TODO: Implement
  [RuleEvaluationMetric.LexicalOverlap]:  undefined as any, // TODO: Implement
  [RuleEvaluationMetric.SemanticSimilarity]:  undefined as any, // TODO: Implement
}

const specification = RuleEvaluationSpecification
export default {
  ...specification,
  icon: 'computer' as IconName,
  ConfigurationForm: ConfigurationForm,
  ResultBadge: ResultBadge,
  metrics: METRICS,
}

function ConfigurationForm<M extends RuleEvaluationMetric>({
  metric,
  ...rest
}: ConfigurationFormProps<EvaluationType.Rule, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      <metricSpecification.ConfigurationForm {...rest} />
    </>
  )
}

function ResultBadge<M extends RuleEvaluationMetric>({
  metric,
  ...rest
}: ResultBadgeProps<EvaluationType.Rule, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      <metricSpecification.ResultBadge {...rest} />
    </>
  )
}
