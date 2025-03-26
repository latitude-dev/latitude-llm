import {
  EvaluationType,
  RuleEvaluationMetric,
  RuleEvaluationSpecification,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  EvaluationMetricFrontendSpecification,
  ResultBadgeProps,
  ResultPanelProps,
  ResultRowCellsProps,
  ResultRowHeadersProps,
} from '../index'
import RuleEvaluationExactMatchSpecification from './ExactMatch'
import RuleEvaluationLengthCountSpecification from './LengthCount'
import RuleEvaluationLexicalOverlapSpecification from './LexicalOverlap'
import RuleEvaluationRegularExpressionSpecification from './RegularExpression'
import RuleEvaluationSchemaValidationSpecification from './SchemaValidation'

// prettier-ignore
const METRICS: {
  [M in RuleEvaluationMetric]: EvaluationMetricFrontendSpecification<EvaluationType.Rule, M>
} = {
  [RuleEvaluationMetric.ExactMatch]: RuleEvaluationExactMatchSpecification,
  [RuleEvaluationMetric.RegularExpression]: RuleEvaluationRegularExpressionSpecification,
  [RuleEvaluationMetric.SchemaValidation]: RuleEvaluationSchemaValidationSpecification,
  [RuleEvaluationMetric.LengthCount]: RuleEvaluationLengthCountSpecification,
  [RuleEvaluationMetric.LexicalOverlap]: RuleEvaluationLexicalOverlapSpecification,
  [RuleEvaluationMetric.SemanticSimilarity]:  undefined as any, // TODO: Implement
}

const specification = RuleEvaluationSpecification
export default {
  ...specification,
  icon: 'computer' as IconName,
  ConfigurationForm: ConfigurationForm,
  ResultBadge: ResultBadge,
  ResultRowHeaders: ResultRowHeaders,
  ResultRowCells: ResultRowCells,
  resultPanelTabs: [],
  ResultPanelMetadata: ResultPanelMetadata,
  ResultPanelContent: ResultPanelContent,
  chartConfiguration: chartConfiguration,
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

function ResultRowHeaders<M extends RuleEvaluationMetric>({
  metric,
  ...rest
}: ResultRowHeadersProps<EvaluationType.Rule, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      <metricSpecification.ResultRowHeaders {...rest} />
    </>
  )
}

function ResultRowCells<M extends RuleEvaluationMetric>({
  metric,
  ...rest
}: ResultRowCellsProps<EvaluationType.Rule, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      <metricSpecification.ResultRowCells {...rest} />
    </>
  )
}

function ResultPanelMetadata<M extends RuleEvaluationMetric>({
  metric,
  ...rest
}: ResultPanelProps<EvaluationType.Rule, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      <metricSpecification.ResultPanelMetadata {...rest} />
    </>
  )
}

function ResultPanelContent<M extends RuleEvaluationMetric>({
  metric,
  ...rest
}: ResultPanelProps<EvaluationType.Rule, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      <metricSpecification.ResultPanelContent {...rest} />
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
