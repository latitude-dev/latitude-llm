import {
  EvaluationType,
  RuleEvaluationLexicalOverlapSpecification,
  RuleEvaluationMetric,
} from '@latitude-data/constants'
import { IconName, NumberInput, Select } from '@latitude-data/web-ui'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
  ResultPanelProps,
  ResultRowCellsProps,
  ResultRowHeadersProps,
} from '../index'

const specification = RuleEvaluationLexicalOverlapSpecification
export default {
  ...specification,
  icon: 'blend' as IconName,
  ConfigurationForm: ConfigurationForm,
  ResultBadge: ResultBadge,
  ResultRowHeaders: ResultRowHeaders,
  ResultRowCells: ResultRowCells,
  resultPanelTabs: [],
  ResultPanelMetadata: ResultPanelMetadata,
  ResultPanelContent: ResultPanelContent,
  chartConfiguration: chartConfiguration,
}

const ALGORITHM_OPTIONS =
  specification.configuration.shape.algorithm.options.map((option) => ({
    label: option.toUpperCase().split('_').join(' '),
    value: option,
  }))

function ConfigurationForm({
  configuration,
  setConfiguration,
  disabled,
}: ConfigurationFormProps<
  EvaluationType.Rule,
  RuleEvaluationMetric.LexicalOverlap
>) {
  return (
    <>
      <Select
        value={configuration.algorithm ?? ''}
        name='algorithm'
        label='Algorithm'
        description='How to measure percentage of overlap'
        placeholder='Select an algorithm'
        options={ALGORITHM_OPTIONS}
        onChange={(value) =>
          setConfiguration({ ...configuration, algorithm: value })
        }
        disabled={disabled}
        required
      />
      <NumberInput
        value={configuration.minOverlap ?? undefined}
        name='minOverlap'
        label='Minimum overlap'
        description='The minimum percentage of overlap of the response'
        placeholder='No minimum'
        min={0}
        max={100}
        onChange={(value) =>
          setConfiguration({ ...configuration, minOverlap: value })
        }
        defaultAppearance
        className='w-full'
        disabled={disabled}
        required
      />
      <NumberInput
        value={configuration.maxOverlap ?? undefined}
        name='maxOverlap'
        label='Maximum overlap'
        description='The maximum percentage of overlap of the response'
        placeholder='No maximum'
        min={0}
        max={100}
        onChange={(value) =>
          setConfiguration({ ...configuration, maxOverlap: value })
        }
        defaultAppearance
        className='w-full'
        disabled={disabled}
        required
      />
    </>
  )
}

function ResultBadge({
  result,
}: ResultBadgeProps<EvaluationType.Rule, RuleEvaluationMetric.LexicalOverlap>) {
  return <>{result.score!.toFixed(0)}% overlap</>
}

function ResultRowHeaders(
  _props: ResultRowHeadersProps<
    EvaluationType.Rule,
    RuleEvaluationMetric.LexicalOverlap
  >,
) {
  return <></>
}

function ResultRowCells(
  _props: ResultRowCellsProps<
    EvaluationType.Rule,
    RuleEvaluationMetric.LexicalOverlap
  >,
) {
  return <></>
}

function ResultPanelMetadata(
  _props: ResultPanelProps<
    EvaluationType.Rule,
    RuleEvaluationMetric.LexicalOverlap
  >,
) {
  return <></>
}

function ResultPanelContent(
  _props: ResultPanelProps<
    EvaluationType.Rule,
    RuleEvaluationMetric.LexicalOverlap
  >,
) {
  return <></>
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<
  EvaluationType.Rule,
  RuleEvaluationMetric.LexicalOverlap
>) {
  return {
    min: 0,
    max: 100,
    thresholds: {
      lower: evaluation.configuration.minOverlap,
      upper: evaluation.configuration.maxOverlap,
    },
    scale: (point: number) => point,
    format: (point: number, short?: boolean) =>
      short ? `${point.toFixed(0)}%` : `${point.toFixed(0)}% overlap`,
  }
}
