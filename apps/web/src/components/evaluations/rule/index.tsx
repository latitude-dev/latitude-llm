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
  ResultPanelProps,
  ResultRowCellsProps,
  ResultRowHeadersProps,
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
  ResultRowHeaders: ResultRowHeaders,
  ResultRowCells: ResultRowCells,
  resultPanelTabs: [],
  ResultPanelMetadata: ResultPanelMetadata,
  ResultPanelContent: ResultPanelContent,
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
