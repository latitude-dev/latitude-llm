import {
  EvaluationType,
  RuleEvaluationExactMatchSpecification,
  RuleEvaluationMetric,
} from '@latitude-data/constants'
import { IconName, SwitchInput } from '@latitude-data/web-ui'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
  ResultPanelProps,
  ResultRowCellsProps,
  ResultRowHeadersProps,
} from '../index'

const specification = RuleEvaluationExactMatchSpecification
export default {
  ...specification,
  icon: 'equal' as IconName,
  ConfigurationForm: ConfigurationForm,
  ResultBadge: ResultBadge,
  ResultRowHeaders: ResultRowHeaders,
  ResultRowCells: ResultRowCells,
  resultPanelTabs: [],
  ResultPanelMetadata: ResultPanelMetadata,
  ResultPanelContent: ResultPanelContent,
  chartConfiguration: chartConfiguration,
}

function ConfigurationForm({
  configuration,
  setConfiguration,
  disabled,
}: ConfigurationFormProps<
  EvaluationType.Rule,
  RuleEvaluationMetric.ExactMatch
>) {
  return (
    <>
      <SwitchInput
        checked={configuration.caseInsensitive ?? false}
        name='caseInsensitive'
        label='Case insensitive'
        description='Ignore case when matching'
        onCheckedChange={(value) =>
          setConfiguration({ ...configuration, caseInsensitive: value })
        }
        disabled={disabled}
        required
      />
    </>
  )
}

function ResultBadge({
  result,
}: ResultBadgeProps<EvaluationType.Rule, RuleEvaluationMetric.ExactMatch>) {
  return <>{result.score === 1 ? 'Matched' : 'Unmatched'}</>
}

function ResultRowHeaders(
  _props: ResultRowHeadersProps<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >,
) {
  return <></>
}

function ResultRowCells(
  _props: ResultRowCellsProps<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >,
) {
  return <></>
}

function ResultPanelMetadata(
  _props: ResultPanelProps<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >,
) {
  return <></>
}

function ResultPanelContent(
  _props: ResultPanelProps<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >,
) {
  return <></>
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<
  EvaluationType.Rule,
  RuleEvaluationMetric.ExactMatch
>) {
  return {
    min: 0,
    max: 100,
    thresholds: {
      lower: evaluation.configuration.reverseScale ? undefined : 50,
      upper: evaluation.configuration.reverseScale ? 50 : undefined,
    },
    scale: (point: number) => Math.min(Math.max(point * 100, 0), 100),
    format: (point: number, short?: boolean) =>
      short ? `${point.toFixed(0)}%` : `${point.toFixed(0)}% matches`,
  }
}
