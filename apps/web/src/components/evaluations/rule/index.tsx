import {
  EvaluationType,
  RuleEvaluationMetric,
  RuleEvaluationSpecification,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  EvaluationMetricFrontendSpecification,
  ResultBadgeProps,
} from '../index'
import RuleEvaluationExactMatchSpecification from './ExactMatch'
import RuleEvaluationLengthCountSpecification from './LengthCount'
import RuleEvaluationLexicalOverlapSpecification from './LexicalOverlap'
import RuleEvaluationNumericSimilaritySpecification from './NumericSimilarity'
import RuleEvaluationRegularExpressionSpecification from './RegularExpression'
import RuleEvaluationSchemaValidationSpecification from './SchemaValidation'
import RuleEvaluationSemanticSimilaritySpecification from './SemanticSimilarity'

// prettier-ignore
const METRICS: {
  [M in RuleEvaluationMetric]: EvaluationMetricFrontendSpecification<EvaluationType.Rule, M>
} = {
  [RuleEvaluationMetric.ExactMatch]: RuleEvaluationExactMatchSpecification,
  [RuleEvaluationMetric.RegularExpression]: RuleEvaluationRegularExpressionSpecification,
  [RuleEvaluationMetric.SchemaValidation]: RuleEvaluationSchemaValidationSpecification,
  [RuleEvaluationMetric.LengthCount]: RuleEvaluationLengthCountSpecification,
  [RuleEvaluationMetric.LexicalOverlap]: RuleEvaluationLexicalOverlapSpecification,
  [RuleEvaluationMetric.SemanticSimilarity]: RuleEvaluationSemanticSimilaritySpecification,
  [RuleEvaluationMetric.NumericSimilarity]: RuleEvaluationNumericSimilaritySpecification,
}

const specification = RuleEvaluationSpecification
export default {
  ...specification,
  icon: 'cpu' as IconName,
  ConfigurationSimpleForm: ConfigurationSimpleForm,
  ConfigurationAdvancedForm: ConfigurationAdvancedForm,
  ResultBadge: ResultBadge,
  chartConfiguration: chartConfiguration,
  metrics: METRICS,
}

function ConfigurationSimpleForm<M extends RuleEvaluationMetric>({
  metric,
  ...rest
}: ConfigurationFormProps<EvaluationType.Rule, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      {!!metricSpecification.ConfigurationSimpleForm && (
        <metricSpecification.ConfigurationSimpleForm {...rest} />
      )}
    </>
  )
}

function ConfigurationAdvancedForm<M extends RuleEvaluationMetric>({
  metric,
  ...rest
}: ConfigurationFormProps<EvaluationType.Rule, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      {!!metricSpecification.ConfigurationAdvancedForm && (
        <metricSpecification.ConfigurationAdvancedForm {...rest} />
      )}
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

function chartConfiguration<M extends RuleEvaluationMetric>({
  metric,
  ...rest
}: ChartConfigurationArgs<EvaluationType.Rule, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) {
    throw new Error('Invalid evaluation metric')
  }

  return metricSpecification.chartConfiguration(rest)
}
